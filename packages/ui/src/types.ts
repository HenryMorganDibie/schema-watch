import type { ChangeSeverity, SchemaChange } from "@schema-watch/core";

/**
 * The record shape both the local agent API and the cloud API render. The two
 * backends store data differently but serialize to this same view model, so
 * every presentational component here works unchanged in both apps.
 */
export interface ContractChangeView {
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

export interface EndpointView {
  id: string;
  method: string;
  pathPattern: string;
  latestSeverity: ChangeSeverity | null;
  changeCount: number;
  lastSeenAt?: string;
}
