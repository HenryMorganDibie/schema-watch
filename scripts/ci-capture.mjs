import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Captures Schema-Watch's own production API contract, by running the agent
 * against the deployed API and driving traffic through it.
 *
 * This is dogfooding: the repository's CI watches the contract of the service
 * this repository ships. Only unauthenticated endpoints are touched, so the
 * job needs no secrets and no database.
 */
const API = process.env.SCHEMA_WATCH_TARGET ?? "https://schema-watch-server-sigma.vercel.app";
const PROXY_PORT = 4590;
const OUT = process.argv[2] ?? "contract.json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "packages", "agent", "dist", "cli.js");

const workdir = mkdtempSync(path.join(tmpdir(), "schema-watch-ci-"));
writeFileSync(
  path.join(workdir, "schema-watch.config.json"),
  JSON.stringify(
    {
      target: API,
      proxyPort: PROXY_PORT,
      apiPort: PROXY_PORT + 1,
      dbPath: path.join(workdir, "ci.db"),
      sync: { enabled: false },
    },
    null,
    2,
  ),
);

const agent = spawn(process.execPath, [cli, "start"], { cwd: workdir, stdio: "inherit" });
const stop = () => agent.kill();
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

const ENDPOINTS = ["/api/health", "/api/billing/providers", "/"];

await new Promise((r) => setTimeout(r, 2500));

let captured = 0;
for (const endpoint of ENDPOINTS) {
  try {
    const res = await fetch(`http://localhost:${PROXY_PORT}${endpoint}`);
    console.log(`  ${res.status} ${endpoint}`);
    captured++;
  } catch (err) {
    console.error(`  failed ${endpoint}: ${err.message}`);
  }
}

if (captured === 0) {
  console.error("Captured nothing - is the API reachable?");
  process.exit(1);
}

// Let the capture finish writing before reading the database back out.
await new Promise((r) => setTimeout(r, 1500));

const exportProc = spawn(process.execPath, [cli, "export", "--out", "contract.json"], {
  cwd: workdir,
  stdio: "inherit",
});
await new Promise((resolve) => exportProc.on("exit", resolve));

copyFileSync(path.join(workdir, "contract.json"), path.resolve(OUT));
console.log(`Wrote ${OUT}`);
stop();
process.exit(0);
