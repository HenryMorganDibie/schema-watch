import {
  diffSchemas,
  inferSchema,
  toPathPattern,
  worstSeverity,
  type BodyTarget,
  type JsonValue,
} from "@schema-watch/core";
import { hashSchema } from "@schema-watch/core/node";
import type { AgentConfig } from "../config.js";
import { agentEvents } from "../events.js";
import type { Db } from "../storage/sqlite.js";
import { getLatestSnapshot, getOrCreateEndpoint, insertChange, insertSnapshot } from "../storage/queries.js";
import { findAffectedFiles } from "./affectedFiles.js";
import { pushCloudSnapshot } from "../sync/cloudClient.js";

export interface CapturedExchange {
  method: string;
  pathname: string;
  statusCode: number;
  requestBody: JsonValue | undefined;
  responseBody: JsonValue | undefined;
}

/**
 * Runs off the critical path (called after the response has already been
 * written back to the client) so schema inference and diffing never add
 * latency to a real request.
 */
export function capture(db: Db, config: AgentConfig, exchange: CapturedExchange): void {
  const pathPattern = toPathPattern(exchange.pathname);
  const endpoint = getOrCreateEndpoint(db, exchange.method, pathPattern);

  processTarget(db, config, endpoint.id, endpoint.method, pathPattern, "request", exchange.statusCode, exchange.requestBody);
  processTarget(db, config, endpoint.id, endpoint.method, pathPattern, "response", exchange.statusCode, exchange.responseBody);
}

function processTarget(
  db: Db,
  config: AgentConfig,
  endpointId: string,
  method: string,
  pathPattern: string,
  target: BodyTarget,
  statusCode: number,
  body: JsonValue | undefined,
): void {
  if (body === undefined) return;

  const schema = inferSchema(body);
  const hash = hashSchema(schema);
  const previous = getLatestSnapshot(db, endpointId, target);

  if (previous && previous.hash === hash) return; // hot path: identical shape, nothing to do

  const snapshot = insertSnapshot(db, { endpointId, target, statusCode, schema, hash });

  if (!previous) return; // first time we've ever seen this endpoint/target - nothing to diff against yet

  const previousSchema = JSON.parse(previous.schema_json);
  const changes = diffSchemas(previousSchema, schema, target);
  if (changes.length === 0) return;

  const severity = worstSeverity(changes)!;
  const affectedFiles = config.frontendSrcDir ? findAffectedFiles(config.frontendSrcDir, pathPattern) : [];

  const changeRow = insertChange(db, {
    endpointId,
    target,
    severity,
    changes,
    affectedFiles,
    fromSnapshotId: previous.id,
    toSnapshotId: snapshot.id,
  });

  agentEvents.emitChange({ ...changeRow, method, path_pattern: pathPattern });

  if (config.sync.enabled) {
    pushCloudSnapshot(config, { method, pathPattern, target, statusCode, schema, previousHash: previous.hash, affectedFiles });
  }
}
