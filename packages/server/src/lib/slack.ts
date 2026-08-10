import { summarizeChange, type ChangeSeverity, type SchemaChange } from "@schema-watch/core";

const SEVERITY_EMOJI: Record<ChangeSeverity, string> = {
  BREAKING: "🔴",
  WARNING: "🟡",
  INFO: "🟢",
};

export interface ContractChangeNotification {
  method: string;
  pathPattern: string;
  severity: ChangeSeverity;
  changes: SchemaChange[];
  affectedFiles: string[];
  projectName: string;
}

export async function sendSlackNotification(webhookUrl: string, change: ContractChangeNotification): Promise<void> {
  const lines = change.changes.slice(0, 5).map((c) => `• ${summarizeChange(c)}`).join("\n");
  const affected =
    change.affectedFiles.length > 0
      ? `\n\n_${change.affectedFiles.length} file${change.affectedFiles.length === 1 ? "" : "s"} reference this endpoint:_ ${change.affectedFiles.slice(0, 6).join(", ")}`
      : "";

  const text = `${SEVERITY_EMOJI[change.severity]} *${change.severity}* contract change in *${change.projectName}*\n*${change.method} ${change.pathPattern}*\n${lines}${affected}`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook responded ${res.status}`);
  }
}
