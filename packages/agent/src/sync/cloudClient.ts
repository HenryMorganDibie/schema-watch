import type { BodyTarget, SchemaNode } from "@schema-watch/core";
import type { AgentConfig } from "../config.js";

interface PushSnapshotParams {
  method: string;
  pathPattern: string;
  target: BodyTarget;
  statusCode: number;
  schema: SchemaNode;
  previousHash: string;
  affectedFiles: string[];
}

/**
 * Fire-and-forget sync to the cloud backend (Pro/Team). Never awaited by the
 * capture path and never throws into it - a flaky network shouldn't affect
 * local monitoring, which has to work fully offline.
 */
export function pushCloudSnapshot(config: AgentConfig, params: PushSnapshotParams): void {
  if (!config.sync.apiKey || !config.sync.projectId) return;

  fetch(`${config.sync.cloudUrl}/api/projects/${config.sync.projectId}/snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.sync.apiKey },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.warn(`[schema-watch] cloud sync failed (continuing locally): ${(err as Error).message}`);
  });
}
