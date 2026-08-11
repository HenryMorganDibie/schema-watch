import type { BodyTarget, SchemaNode } from "@schema-watch/core";
import type { Db } from "./storage/sqlite.js";

export interface ContractEntry {
  method: string;
  pathPattern: string;
  target: BodyTarget;
  statusCode: number | null;
  schema: SchemaNode;
}

interface ExportRow {
  method: string;
  path_pattern: string;
  target: BodyTarget;
  status_code: number | null;
  schema_json: string;
}

/**
 * Snapshots the current contract: the newest schema recorded for every
 * endpoint and body target. This is the payload `POST /api/ci/check` expects,
 * so a CI job can capture traffic during its test run, export, and have the
 * server diff this branch's contract against the last known good one.
 */
export function exportContract(db: Db): ContractEntry[] {
  const rows = db
    .prepare(
      `SELECT e.method, e.path_pattern, s.target, s.status_code, s.schema_json
       FROM snapshots s
       JOIN endpoints e ON e.id = s.endpoint_id
       WHERE s.created_at = (
         SELECT MAX(s2.created_at)
         FROM snapshots s2
         WHERE s2.endpoint_id = s.endpoint_id AND s2.target = s.target
       )
       ORDER BY e.method, e.path_pattern, s.target`,
    )
    .all() as unknown as ExportRow[];

  return rows.map((row) => ({
    method: row.method,
    pathPattern: row.path_pattern,
    target: row.target,
    statusCode: row.status_code,
    schema: JSON.parse(row.schema_json) as SchemaNode,
  }));
}
