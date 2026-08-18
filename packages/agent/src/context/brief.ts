import { existsSync } from "node:fs";
import type { BodyTarget, ChangeSeverity, SchemaChange } from "@schema-watch/core";
import type { AgentConfig } from "../config.js";
import type { Db } from "../storage/sqlite.js";
import { listChanges, listEndpointSummaries } from "../storage/queries.js";
import { findAffectedFiles } from "../proxy/affectedFiles.js";

export interface ContextBriefEndpoint {
  method: string;
  pathPattern: string;
  latestSeverity: ChangeSeverity | null;
  changeCount: number;
  lastSeenAt: string;
}

export interface ContextBriefBreakingChange {
  method: string;
  pathPattern: string;
  target: BodyTarget;
  changes: SchemaChange[];
  affectedFiles: string[];
  createdAt: string;
}

export interface ContextBriefFrontendReference {
  method: string;
  pathPattern: string;
  files: string[];
}

export interface ContextBrief {
  generatedAt: string;
  target: string;
  frontendSrcDir?: string;
  endpoints: ContextBriefEndpoint[];
  breakingChanges: ContextBriefBreakingChange[];
  /** Only present when `frontendSrcDir` is configured and exists on disk. */
  frontendReferences?: ContextBriefFrontendReference[];
}

const DEFAULT_BREAKING_CHANGE_LIMIT = 20;

/**
 * Assembles the current, factual state of the captured API contract - no
 * inferred conventions, nothing guessed - for handing to a fresh AI chat so
 * it doesn't need the codebase re-explained from scratch.
 */
export function buildContextBrief(db: Db, config: AgentConfig, opts?: { limit?: number }): ContextBrief {
  const limit = opts?.limit ?? DEFAULT_BREAKING_CHANGE_LIMIT;

  const endpoints: ContextBriefEndpoint[] = listEndpointSummaries(db).map((row) => ({
    method: row.method,
    pathPattern: row.path_pattern,
    latestSeverity: row.latest_severity,
    changeCount: row.change_count,
    lastSeenAt: row.last_seen_at,
  }));

  // The changes table only holds rows where a diff actually fired, but it's
  // not filtered by severity, so over-fetch before filtering down to BREAKING
  // and capping at `limit` - otherwise a burst of WARNING/INFO rows could
  // push real breaking changes out of the query window entirely.
  const breakingChanges: ContextBriefBreakingChange[] = listChanges(db, undefined, Math.max(limit * 5, 200))
    .filter((row) => row.severity === "BREAKING")
    .slice(0, limit)
    .map((row) => ({
      method: row.method,
      pathPattern: row.path_pattern,
      target: row.target,
      changes: JSON.parse(row.changes_json) as SchemaChange[],
      affectedFiles: JSON.parse(row.affected_files_json) as string[],
      createdAt: row.created_at,
    }));

  const brief: ContextBrief = {
    generatedAt: new Date().toISOString(),
    target: config.target,
    frontendSrcDir: config.frontendSrcDir,
    endpoints,
    breakingChanges,
  };

  if (config.frontendSrcDir && existsSync(config.frontendSrcDir)) {
    brief.frontendReferences = endpoints
      .map((endpoint) => ({
        method: endpoint.method,
        pathPattern: endpoint.pathPattern,
        files: findAffectedFiles(config.frontendSrcDir!, endpoint.pathPattern),
      }))
      .filter((ref) => ref.files.length > 0);
  }

  return brief;
}
