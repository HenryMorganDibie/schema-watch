import type { ChangeSeverity, SchemaChange } from "@schema-watch/core";

export interface EndpointSummary {
  id: string;
  method: string;
  pathPattern: string;
  lastSeenAt: string;
  latestSeverity: ChangeSeverity | null;
  changeCount: number;
}

export interface ContractChangeRecord {
  id: string;
  endpointId: string;
  method: string;
  pathPattern: string;
  severity: ChangeSeverity;
  target: "request" | "response";
  changes: SchemaChange[];
  affectedFiles: string[];
  acknowledged: boolean;
  createdAt: string;
}
