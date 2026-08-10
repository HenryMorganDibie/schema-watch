import type { ChangeRow } from "../storage/queries.js";

export function serializeChange(row: ChangeRow & { method: string; path_pattern: string }) {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    method: row.method,
    pathPattern: row.path_pattern,
    severity: row.severity,
    target: row.target,
    changes: JSON.parse(row.changes_json),
    affectedFiles: JSON.parse(row.affected_files_json),
    acknowledged: Boolean(row.acknowledged),
    createdAt: row.created_at,
  };
}
