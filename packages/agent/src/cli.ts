#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SchemaChange } from "@schema-watch/core";
import { configPath, loadConfig, DEFAULTS, type AgentConfig } from "./config.js";
import { compareContracts, type ComparisonResult } from "./ci/compare.js";
import { renderConsoleReport, renderMarkdownReport } from "./ci/format.js";
import { createCheckRun, readGitHubContext, upsertPullRequestComment } from "./ci/github.js";
import { renderSarif } from "./ci/sarif.js";
import { exportContract, type ContractEntry } from "./export.js";
import { findAffectedFiles } from "./proxy/affectedFiles.js";
import { openDatabase } from "./storage/sqlite.js";
import { startProxyServer } from "./proxy/server.js";
import { startApiServer } from "./api/server.js";
import { buildContextBrief } from "./context/brief.js";
import { renderContextBriefMarkdown } from "./context/markdown.js";
import { writeContextFile, upsertFencedBlock } from "./context/write.js";

const CONTEXT_START_MARKER = "<!-- schema-watch-context:start -->";
const CONTEXT_END_MARKER = "<!-- schema-watch-context:end -->";

const [, , command, ...rest] = process.argv;

switch (command) {
  case "init":
    runInit(rest);
    break;
  case "start":
    runStart();
    break;
  case "export":
    runExport(rest);
    break;
  case "check":
    await runCheck(rest);
    break;
  case "context":
    runContext(rest);
    break;
  default:
    printHelp();
    process.exit(command ? 1 : 0);
}

function printHelp(): void {
  console.log(`schema-watch - live API contract monitoring

Usage:
  schema-watch init [--target <url>]   Create schema-watch.config.json in this directory
  schema-watch start                   Start the proxy + dashboard
  schema-watch export [--out <file>]   Write the captured contract to JSON (default: contract.json)
  schema-watch check [options]        Compare a contract and exit 1 on a breaking change.
      --contract <file>               Contract to check (default: the live capture database)
      --baseline <file>               Compare locally against this contract; no account needed
      --frontend-src <dir>            Scan this directory for files referencing changed endpoints
      --sarif <file>                  Also write SARIF 2.1.0 for GitHub code scanning
      --project <id> --api-key <key>  Use the cloud gate instead of --baseline
  schema-watch context [options]      Write an AI context brief: captured endpoints, recent
                                       breaking changes, and frontend cross-references.
      --out <file>                    Where to write it (default: CONTEXT.md)
      --claude-md                     Upsert into CLAUDE.md instead of --out
      --limit <n>                     Max recent breaking changes to include (default: 20)

Example:
  schema-watch init --target http://localhost:3001
  schema-watch start

  # in CI, after your integration tests have driven traffic through the proxy:
  schema-watch export --out contract.json
  schema-watch check --contract contract.json --baseline .schema-watch/baseline.json
`);
}

function runInit(args: string[]): void {
  const targetFlagIndex = args.indexOf("--target");
  const target = targetFlagIndex !== -1 ? args[targetFlagIndex + 1] : "http://localhost:3001";
  const dest = configPath();

  if (existsSync(dest)) {
    console.error(`${dest} already exists - delete it first if you want to regenerate it.`);
    process.exit(1);
  }

  writeFileSync(
    dest,
    JSON.stringify(
      {
        target,
        proxyPort: DEFAULTS.proxyPort,
        apiPort: DEFAULTS.apiPort,
        dbPath: DEFAULTS.dbPath,
        frontendSrcDir: "../my-frontend/src",
        sync: { enabled: false },
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Wrote ${dest}.

Point your frontend's API base URL at http://localhost:${DEFAULTS.proxyPort} instead of
${target}, then run:

  schema-watch start
`);
}

function runStart(): void {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  startProxyServer(db, config);
  startApiServer(db, config);

  console.log(`schema-watch is watching.

  Proxy:      http://localhost:${config.proxyPort}  →  ${config.target}
  Dashboard:  http://localhost:${config.apiPort}
  Database:   ${config.dbPath}
${config.frontendSrcDir ? `  Scanning:   ${config.frontendSrcDir} for affected components\n` : ""}
Point your frontend at the proxy URL above and work as usual - nothing shows up
here until a request or response shape actually changes.
`);

  process.on("SIGINT", () => process.exit(0));
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function runExport(args: string[]): void {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const outPath = flagValue(args, "--out") ?? "contract.json";

  const entries = exportContract(db);
  if (entries.length === 0) {
    console.error(
      "No contract captured yet. Run the proxy and drive traffic through it before exporting.",
    );
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} contract entries to ${outPath}`);
}

function runContext(args: string[]): void {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  const limitFlag = flagValue(args, "--limit");
  const limit = limitFlag ? Number(limitFlag) : undefined;

  const brief = buildContextBrief(db, config, { limit });
  const markdown = renderContextBriefMarkdown(brief);

  if (args.includes("--claude-md")) {
    upsertFencedBlock("CLAUDE.md", CONTEXT_START_MARKER, CONTEXT_END_MARKER, markdown);
    console.log("Updated the Schema-Watch section of CLAUDE.md");
    return;
  }

  const outPath = flagValue(args, "--out") ?? "CONTEXT.md";
  writeContextFile(outPath, markdown);
  console.log(`Wrote ${brief.endpoints.length} endpoint(s) and ${brief.breakingChanges.length} recent breaking change(s) to ${outPath}`);
}

/**
 * The CI gate. Exits non-zero on a breaking change so the workflow step fails
 * and the PR is blocked.
 *
 * Two modes. With --baseline it compares two contract files locally, needing
 * no account and no network - this is what makes the GitHub Action
 * copy-pasteable. With a project id and API key it defers to the cloud gate,
 * which additionally keeps history and enforces the plan.
 */
async function runCheck(args: string[]): Promise<void> {
  const config = loadConfig({ optional: true });

  const contractFile = flagValue(args, "--contract");
  const entries: ContractEntry[] = contractFile
    ? readContractFile(contractFile)
    : exportContract(openDatabase(config?.dbPath ?? "./schema-watch.db"));

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error("No contract captured yet - nothing to check.");
    process.exit(2);
  }

  const baselineFile = flagValue(args, "--baseline");
  const projectId = flagValue(args, "--project") ?? config?.sync.projectId;
  const apiKey = flagValue(args, "--api-key") ?? config?.sync.apiKey;

  if (!baselineFile && (!projectId || !apiKey)) {
    console.error(
      "schema-watch check needs either --baseline <file> for a local comparison,\n" +
        "or --project <id> --api-key <key> to use the cloud gate.",
    );
    process.exit(2);
  }

  const result = baselineFile
    ? compareContracts(readContractFile(baselineFile), entries, buildAffectedFinder(args, config))
    : await checkAgainstCloud(entries, projectId!, apiKey!, flagValue(args, "--cloud-url") ?? config?.sync.cloudUrl);

  console.log(renderConsoleReport(result));

  const sarifPath = flagValue(args, "--sarif");
  if (sarifPath) {
    writeFileSync(sarifPath, renderSarif(result, contractFile ?? "contract.json"));
    console.log(`Wrote SARIF to ${sarifPath}`);
  }

  await reportToGitHub(result);

  if (!result.pass) {
    console.error("\nBreaking API contract changes detected.");
    process.exit(1);
  }
}

function readContractFile(file: string): ContractEntry[] {
  if (!existsSync(file)) {
    console.error(`Contract file not found: ${file}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, "utf-8")) as ContractEntry[];
}

/**
 * Scans the checked-out frontend so "which files break" works in CI too.
 *
 * findAffectedFiles reports paths relative to the scanned directory, but
 * SARIF locations and PR comments have to be relative to the repository root
 * or GitHub annotates files that do not exist. Re-prefix them here.
 */
function buildAffectedFinder(args: string[], config: AgentConfig | null) {
  const dir = flagValue(args, "--frontend-src") ?? config?.frontendSrcDir;
  if (!dir || !existsSync(dir)) return undefined;

  const prefix = path.relative(process.cwd(), path.resolve(dir)).split(path.sep).join("/");
  return (pathPattern: string) =>
    findAffectedFiles(dir, pathPattern).map((file) => (prefix ? `${prefix}/${file}` : file));
}

async function checkAgainstCloud(
  entries: ContractEntry[],
  projectId: string,
  apiKey: string,
  cloudUrl = "https://api.schema-watch.dev",
): Promise<ComparisonResult> {
  let response: Response;
  try {
    response = await fetch(`${cloudUrl}/api/ci/check`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ projectId, entries }),
    });
  } catch (err) {
    console.error(`Could not reach the contract API at ${cloudUrl}: ${(err as Error).message}`);
    process.exit(2);
  }

  if (!response.ok) {
    console.error(`Contract check failed: ${response.status} ${await response.text()}`);
    process.exit(2);
  }

  const body = (await response.json()) as {
    pass: boolean;
    breakingChanges: { endpointId: string; changes: SchemaChange[]; affectedFiles: string[] }[];
  };

  return {
    pass: body.pass,
    newEndpoints: [],
    findings: body.breakingChanges.map((b) => ({
      method: "",
      pathPattern: b.endpointId,
      target: "response" as const,
      severity: "BREAKING" as const,
      changes: b.changes,
      affectedFiles: b.affectedFiles,
    })),
  };
}

/** Posts the report when running inside GitHub Actions; a no-op anywhere else. */
async function reportToGitHub(result: ComparisonResult): Promise<void> {
  const ctx = readGitHubContext();
  if (!ctx) return;

  const body = renderMarkdownReport(result);
  const breaking = result.findings.filter((f) => f.severity === "BREAKING").length;

  try {
    await upsertPullRequestComment(ctx, body);
    await createCheckRun(ctx, {
      pass: result.pass,
      title: result.pass ? "No breaking contract changes" : `${breaking} breaking contract change${breaking === 1 ? "" : "s"}`,
      summary: body,
    });
  } catch (err) {
    // A missing permission should not mask the contract result itself, which
    // the exit code still reports correctly.
    console.warn(`[schema-watch] could not post to GitHub: ${(err as Error).message}`);
    console.warn("[schema-watch] the workflow needs: permissions: { pull-requests: write, checks: write }");
  }
}
