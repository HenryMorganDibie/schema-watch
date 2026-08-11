#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { configPath, loadConfig, DEFAULTS } from "./config.js";
import { exportContract } from "./export.js";
import { openDatabase } from "./storage/sqlite.js";
import { startProxyServer } from "./proxy/server.js";
import { startApiServer } from "./api/server.js";

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
  schema-watch check [--contract <file>]
                                      Send the contract to the cloud CI gate; exits 1 on a breaking change.
                                      Reads the live capture database unless --contract is given.

Example:
  schema-watch init --target http://localhost:3001
  schema-watch start

  # in CI, after your integration tests have driven traffic through the proxy:
  schema-watch export --out contract.json
  schema-watch check --contract contract.json
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

/**
 * The CI gate. Exits non-zero on a breaking change so a workflow step fails
 * and the PR is blocked.
 */
async function runCheck(args: string[]): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  const projectId = flagValue(args, "--project") ?? config.sync.projectId;
  const apiKey = flagValue(args, "--api-key") ?? config.sync.apiKey;
  const cloudUrl = flagValue(args, "--cloud-url") ?? config.sync.cloudUrl;

  if (!projectId || !apiKey) {
    console.error(
      "schema-watch check needs a project id and API key.\n" +
        "Pass --project <id> --api-key <key>, or set SCHEMA_WATCH_SYNC_PROJECT_ID and SCHEMA_WATCH_SYNC_API_KEY.",
    );
    process.exit(2);
  }

  // Either check a contract exported earlier (the two-step CI flow) or read
  // the live capture database directly (the one-step flow).
  const contractFile = flagValue(args, "--contract");
  let entries;
  if (contractFile) {
    if (!existsSync(contractFile)) {
      console.error(`Contract file not found: ${contractFile}`);
      process.exit(2);
    }
    entries = JSON.parse(readFileSync(contractFile, "utf-8"));
  } else {
    entries = exportContract(db);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error("No contract captured yet - nothing to check.");
    process.exit(2);
  }

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

  const result = (await response.json()) as {
    pass: boolean;
    breakingChanges: { changes: { path: string; before?: string; after?: string }[]; affectedFiles: string[] }[];
  };

  if (result.pass) {
    console.log(`No breaking contract changes across ${entries.length} endpoints.`);
    return;
  }

  console.error("\nBreaking API contract changes detected:\n");
  for (const breaking of result.breakingChanges) {
    for (const change of breaking.changes) {
      console.error(`  ${change.path}: ${change.before ?? "(absent)"} -> ${change.after ?? "(removed)"}`);
    }
    if (breaking.affectedFiles.length > 0) {
      console.error(`    affects: ${breaking.affectedFiles.join(", ")}`);
    }
  }
  console.error("");
  process.exit(1);
}
