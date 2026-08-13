import { diffSchemas, worstSeverity, type ChangeSeverity, type SchemaChange } from "@schema-watch/core";
import type { ContractEntry } from "../export.js";

export interface EndpointFinding {
  method: string;
  pathPattern: string;
  target: "request" | "response";
  severity: ChangeSeverity;
  changes: SchemaChange[];
  affectedFiles: string[];
}

export interface ComparisonResult {
  findings: EndpointFinding[];
  pass: boolean;
  /** Endpoints in the new contract that the baseline had never seen. */
  newEndpoints: string[];
}

const key = (e: ContractEntry) => `${e.method} ${e.pathPattern} ${e.target}`;

/**
 * Compares a freshly captured contract against a committed baseline, entirely
 * locally. This is what lets the CI gate work with no account and no network:
 * the same diff engine the agent uses, pointed at two JSON files.
 *
 * Endpoints missing from the new contract are deliberately NOT reported as
 * removals. In CI a contract only contains what the test run actually
 * exercised, so an untested endpoint is indistinguishable from a deleted one,
 * and guessing produces false alarms on every PR that skips a test.
 */
export function compareContracts(
  baseline: ContractEntry[],
  current: ContractEntry[],
  findAffected?: (pathPattern: string) => string[],
): ComparisonResult {
  const baselineByKey = new Map(baseline.map((e) => [key(e), e]));
  const findings: EndpointFinding[] = [];
  const newEndpoints: string[] = [];

  for (const entry of current) {
    const previous = baselineByKey.get(key(entry));
    if (!previous) {
      newEndpoints.push(`${entry.method} ${entry.pathPattern}`);
      continue;
    }

    const changes = diffSchemas(previous.schema, entry.schema, entry.target);
    if (changes.length === 0) continue;

    findings.push({
      method: entry.method,
      pathPattern: entry.pathPattern,
      target: entry.target,
      severity: worstSeverity(changes)!,
      changes,
      affectedFiles: findAffected ? findAffected(entry.pathPattern) : [],
    });
  }

  // Most severe first, so the PR comment leads with what actually matters.
  const rank: Record<ChangeSeverity, number> = { BREAKING: 0, WARNING: 1, INFO: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    findings,
    pass: !findings.some((f) => f.severity === "BREAKING"),
    newEndpoints,
  };
}
