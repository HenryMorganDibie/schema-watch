import { summarizeChange } from "@schema-watch/core";
import { SEVERITY_ICON, type ContractChangeNotification, type DeliveryOutcome } from "./types.js";

/** Slack incoming webhooks live only on this host; see webhookHost checks. */
export const SLACK_WEBHOOK_HOST = "hooks.slack.com";

export function buildSlackPayload(n: ContractChangeNotification): object {
  const lines = n.changes.slice(0, 8).map((c) => `• ${summarizeChange(c)}`);
  if (n.changes.length > 8) lines.push(`• ...and ${n.changes.length - 8} more`);

  const affected =
    n.affectedFiles.length > 0
      ? `\n\n_${n.affectedFiles.length} ${n.affectedFiles.length === 1 ? "file references" : "files reference"} this endpoint:_ ${n.affectedFiles
          .slice(0, 6)
          .map((f) => `\`${f}\``)
          .join(", ")}`
      : "";

  const heading = n.isTest
    ? `${SEVERITY_ICON[n.severity]} *Schema-Watch test message* for *${n.projectName}*`
    : `${SEVERITY_ICON[n.severity]} *${n.severity}* contract change in *${n.projectName}*`;

  return {
    // `text` doubles as the notification preview, so it must stand alone.
    text: `${heading}\n*${n.method} ${n.pathPattern}* (${n.target})\n${lines.join("\n")}${affected}`,
  };
}

export async function deliverSlack(webhookUrl: string, n: ContractChangeNotification): Promise<DeliveryOutcome> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildSlackPayload(n)),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return { ok: false, statusCode: res.status, error: (await res.text().catch(() => "")).slice(0, 300) };
  }
  return { ok: true, statusCode: res.status };
}
