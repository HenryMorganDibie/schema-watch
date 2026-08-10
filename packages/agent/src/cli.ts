#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { configPath, loadConfig, DEFAULTS } from "./config.js";
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
  default:
    printHelp();
    process.exit(command ? 1 : 0);
}

function printHelp(): void {
  console.log(`schema-watch - live API contract monitoring

Usage:
  schema-watch init [--target <url>]   Create schema-watch.config.json in this directory
  schema-watch start                   Start the proxy + dashboard

Example:
  schema-watch init --target http://localhost:3001
  schema-watch start
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
