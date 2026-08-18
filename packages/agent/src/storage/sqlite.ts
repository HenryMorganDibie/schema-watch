import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(method, path_pattern)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id),
  target TEXT NOT NULL,
  status_code INTEGER,
  schema_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_lookup ON snapshots(endpoint_id, target, created_at);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id),
  severity TEXT NOT NULL,
  target TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  affected_files_json TEXT NOT NULL DEFAULT '[]',
  from_snapshot_id TEXT,
  to_snapshot_id TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changes_lookup ON changes(endpoint_id, created_at);
`;

export type Db = DatabaseSync;

/**
 * `options.timeout` sets `PRAGMA busy_timeout` (ms), for a reader opening the
 * same file from a second OS process (e.g. the MCP server) while the proxy
 * may be mid-write. WAL already makes concurrent reads safe; this just makes
 * a reader retry briefly on a transient lock instead of throwing. Implemented
 * as a SQL pragma rather than `DatabaseSync`'s native `timeout` constructor
 * option, which is gated to Node >=22.16.0.
 */
export function openDatabase(dbPath: string, options?: { timeout?: number }): Db {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  if (options?.timeout) db.exec(`PRAGMA busy_timeout = ${options.timeout};`);
  db.exec(SCHEMA);
  return db;
}
