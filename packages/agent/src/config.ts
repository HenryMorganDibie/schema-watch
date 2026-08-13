import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface SyncConfig {
  enabled: boolean;
  apiKey?: string;
  projectId?: string;
  cloudUrl?: string;
}

export interface AgentConfig {
  /** The real backend this proxy sits in front of, e.g. http://localhost:3001 */
  target: string;
  proxyPort: number;
  apiPort: number;
  dbPath: string;
  /** Frontend source root to grep for "who uses this endpoint" on a breaking change. */
  frontendSrcDir?: string;
  sync: SyncConfig;
}

const CONFIG_FILENAME = "schema-watch.config.json";

const DEFAULTS: Omit<AgentConfig, "target"> = {
  proxyPort: 4560,
  apiPort: 4561,
  dbPath: "./schema-watch.db",
  sync: { enabled: false },
};

export function loadConfig(options?: { optional?: boolean; cwd?: string }): AgentConfig;
export function loadConfig(cwd: string): AgentConfig;
/**
 * `optional` is for CI, where `check --baseline` compares two files and needs
 * no proxy target at all. Everywhere else a missing target is a hard error,
 * since the agent cannot do anything useful without one.
 */
export function loadConfig(arg?: string | { optional?: boolean; cwd?: string }): AgentConfig | null {
  const options = typeof arg === "string" ? { cwd: arg } : (arg ?? {});
  const cwd = options.cwd ?? process.cwd();
  const optional = "optional" in options ? options.optional : false;
  const configPath = path.join(cwd, CONFIG_FILENAME);
  let fileConfig: Partial<AgentConfig> = {};

  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  }

  const target = fileConfig.target ?? process.env.SCHEMA_WATCH_TARGET;
  if (!target) {
    if (optional) return null;
    throw new Error(
      `No proxy target configured. Run "schema-watch init" to create ${CONFIG_FILENAME}, ` +
        `or set SCHEMA_WATCH_TARGET=http://localhost:PORT`,
    );
  }

  return {
    target,
    proxyPort: fileConfig.proxyPort ?? Number(process.env.SCHEMA_WATCH_PROXY_PORT) ?? DEFAULTS.proxyPort,
    apiPort: fileConfig.apiPort ?? Number(process.env.SCHEMA_WATCH_API_PORT) ?? DEFAULTS.apiPort,
    dbPath: fileConfig.dbPath ?? DEFAULTS.dbPath,
    frontendSrcDir: fileConfig.frontendSrcDir,
    sync: {
      enabled: fileConfig.sync?.enabled ?? Boolean(process.env.SCHEMA_WATCH_SYNC_API_KEY),
      apiKey: fileConfig.sync?.apiKey ?? process.env.SCHEMA_WATCH_SYNC_API_KEY,
      projectId: fileConfig.sync?.projectId ?? process.env.SCHEMA_WATCH_SYNC_PROJECT_ID,
      cloudUrl: fileConfig.sync?.cloudUrl ?? process.env.SCHEMA_WATCH_CLOUD_URL ?? "https://api.schema-watch.dev",
    },
  };
}

export function configPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export { CONFIG_FILENAME, DEFAULTS };
