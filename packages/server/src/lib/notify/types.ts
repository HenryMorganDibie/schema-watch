import type { ChangeSeverity, SchemaChange } from "@schema-watch/core";

export interface ContractChangeNotification {
  projectName: string;
  method: string;
  pathPattern: string;
  target: "request" | "response";
  severity: ChangeSeverity;
  changes: SchemaChange[];
  affectedFiles: string[];
  /** Set for a manual test send, so the message says so rather than alarming a channel. */
  isTest?: boolean;
}

export interface DeliveryOutcome {
  ok: boolean;
  statusCode?: number;
  error?: string;
}

export const SEVERITY_ICON: Record<ChangeSeverity, string> = {
  BREAKING: "🔴",
  WARNING: "🟡",
  INFO: "🟢",
};

/** Hex colours for providers that support them, matching the dashboard. */
export const SEVERITY_COLOR: Record<ChangeSeverity, number> = {
  BREAKING: 0xd03b3b,
  WARNING: 0xd98300,
  INFO: 0x0ca30c,
};

const RANK: Record<ChangeSeverity, number> = { INFO: 0, WARNING: 1, BREAKING: 2 };

/** True when `severity` is at least as severe as `minimum`. */
export function meetsThreshold(severity: ChangeSeverity, minimum: ChangeSeverity): boolean {
  return RANK[severity] >= RANK[minimum];
}
