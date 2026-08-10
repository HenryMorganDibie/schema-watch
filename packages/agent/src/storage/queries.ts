import { randomUUID } from "node:crypto";
import type { BodyTarget, ChangeSeverity, SchemaChange, SchemaNode } from "@schema-watch/core";
import type { Db } from "./sqlite.js";

/** node:sqlite's named-parameter overload wants an indexable
 * `Record<string, SQLInputValue>`; our row interfaces are plain shapes for
 * readability elsewhere, so bind params through this narrow, local cast
 * rather than loosening every interface with an index signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bind<T extends object>(row: T): any {
  return row;
}

export interface EndpointRow {
  id: string;
  method: string;
  path_pattern: string;
  created_at: string;
}

export interface SnapshotRow {
  id: string;
  endpoint_id: string;
  target: BodyTarget;
  status_code: number | null;
  schema_json: string;
  hash: string;
  created_at: string;
}

export interface ChangeRow {
  id: string;
  endpoint_id: string;
  severity: ChangeSeverity;
  target: BodyTarget;
  changes_json: string;
  affected_files_json: string;
  from_snapshot_id: string | null;
  to_snapshot_id: string | null;
  acknowledged: number;
  created_at: string;
}

export function getOrCreateEndpoint(db: Db, method: string, pathPattern: string): EndpointRow {
  const existing = db
    .prepare("SELECT * FROM endpoints WHERE method = ? AND path_pattern = ?")
    .get(method, pathPattern) as EndpointRow | undefined;
  if (existing) return existing;

  const row: EndpointRow = {
    id: randomUUID(),
    method,
    path_pattern: pathPattern,
    created_at: new Date().toISOString(),
  };
  db.prepare("INSERT INTO endpoints (id, method, path_pattern, created_at) VALUES (@id, @method, @path_pattern, @created_at)").run(bind(row));
  return row;
}

export function getLatestSnapshot(db: Db, endpointId: string, target: BodyTarget): SnapshotRow | undefined {
  return db
    .prepare(
      "SELECT * FROM snapshots WHERE endpoint_id = ? AND target = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(endpointId, target) as SnapshotRow | undefined;
}

export function insertSnapshot(
  db: Db,
  params: { endpointId: string; target: BodyTarget; statusCode: number | null; schema: SchemaNode; hash: string },
): SnapshotRow {
  const row: SnapshotRow = {
    id: randomUUID(),
    endpoint_id: params.endpointId,
    target: params.target,
    status_code: params.statusCode,
    schema_json: JSON.stringify(params.schema),
    hash: params.hash,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO snapshots (id, endpoint_id, target, status_code, schema_json, hash, created_at) VALUES (@id, @endpoint_id, @target, @status_code, @schema_json, @hash, @created_at)",
  ).run(bind(row));
  return row;
}

export function insertChange(
  db: Db,
  params: {
    endpointId: string;
    target: BodyTarget;
    severity: ChangeSeverity;
    changes: SchemaChange[];
    affectedFiles: string[];
    fromSnapshotId?: string;
    toSnapshotId?: string;
  },
): ChangeRow {
  const row: ChangeRow = {
    id: randomUUID(),
    endpoint_id: params.endpointId,
    severity: params.severity,
    target: params.target,
    changes_json: JSON.stringify(params.changes),
    affected_files_json: JSON.stringify(params.affectedFiles),
    from_snapshot_id: params.fromSnapshotId ?? null,
    to_snapshot_id: params.toSnapshotId ?? null,
    acknowledged: 0,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO changes (id, endpoint_id, severity, target, changes_json, affected_files_json, from_snapshot_id, to_snapshot_id, acknowledged, created_at)
     VALUES (@id, @endpoint_id, @severity, @target, @changes_json, @affected_files_json, @from_snapshot_id, @to_snapshot_id, @acknowledged, @created_at)`,
  ).run(bind(row));
  return row;
}

export interface EndpointSummaryRow extends EndpointRow {
  latest_severity: ChangeSeverity | null;
  change_count: number;
  last_seen_at: string;
}

export function listEndpointSummaries(db: Db): EndpointSummaryRow[] {
  return db
    .prepare(
      `SELECT
         e.*,
         (SELECT c.severity FROM changes c WHERE c.endpoint_id = e.id ORDER BY c.created_at DESC LIMIT 1) AS latest_severity,
         (SELECT COUNT(*) FROM changes c WHERE c.endpoint_id = e.id) AS change_count,
         COALESCE(
           (SELECT MAX(s.created_at) FROM snapshots s WHERE s.endpoint_id = e.id),
           e.created_at
         ) AS last_seen_at
       FROM endpoints e
       ORDER BY last_seen_at DESC`,
    )
    .all() as unknown as EndpointSummaryRow[];
}

export function listChanges(db: Db, endpointId?: string, limit = 200): (ChangeRow & { method: string; path_pattern: string })[] {
  const query = endpointId
    ? db.prepare(
        `SELECT c.*, e.method, e.path_pattern FROM changes c
         JOIN endpoints e ON e.id = c.endpoint_id
         WHERE c.endpoint_id = ?
         ORDER BY c.created_at DESC LIMIT ?`,
      )
    : db.prepare(
        `SELECT c.*, e.method, e.path_pattern FROM changes c
         JOIN endpoints e ON e.id = c.endpoint_id
         ORDER BY c.created_at DESC LIMIT ?`,
      );
  const rows = endpointId ? query.all(endpointId, limit) : query.all(limit);
  return rows as unknown as (ChangeRow & { method: string; path_pattern: string })[];
}

export function acknowledgeChange(db: Db, changeId: string): void {
  db.prepare("UPDATE changes SET acknowledged = 1 WHERE id = ?").run(changeId);
}

export function getEndpoint(db: Db, endpointId: string): EndpointRow | undefined {
  return db.prepare("SELECT * FROM endpoints WHERE id = ?").get(endpointId) as EndpointRow | undefined;
}
