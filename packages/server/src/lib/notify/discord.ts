import { summarizeChange } from "@schema-watch/core";
import { SEVERITY_COLOR, SEVERITY_ICON, type ContractChangeNotification, type DeliveryOutcome } from "./types.js";

/** Discord webhooks live on these hosts; see webhookHost checks. */
export const DISCORD_WEBHOOK_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];

/**
 * Discord rejects Slack's `{text: ...}` body outright, which is why the
 * previous single-payload approach could never have worked here. Embeds also
 * give a coloured left border matching the severity.
 */
export function buildDiscordPayload(n: ContractChangeNotification): object {
  const lines = n.changes.slice(0, 8).map((c) => summarizeChange(c));
  if (n.changes.length > 8) lines.push(`...and ${n.changes.length - 8} more`);

  const fields: { name: string; value: string }[] = [
    { name: "Endpoint", value: `\`${n.method} ${n.pathPattern}\` (${n.target})` },
    { name: "Changes", value: "```diff\n" + lines.map((l) => `- ${l}`).join("\n") + "\n```" },
  ];

  if (n.affectedFiles.length > 0) {
    fields.push({
      name: `Affected files (${n.affectedFiles.length})`,
      value: n.affectedFiles.slice(0, 6).map((f) => `\`${f}\``).join("\n"),
    });
  }

  return {
    embeds: [
      {
        title: n.isTest
          ? `${SEVERITY_ICON[n.severity]} Schema-Watch test message`
          : `${SEVERITY_ICON[n.severity]} ${n.severity} contract change`,
        description: n.projectName,
        color: SEVERITY_COLOR[n.severity],
        fields,
        // Discord caps embed field values at 1024 characters; the slices above
        // keep every field comfortably inside that.
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function deliverDiscord(webhookUrl: string, n: ContractChangeNotification): Promise<DeliveryOutcome> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDiscordPayload(n)),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return { ok: false, statusCode: res.status, error: (await res.text().catch(() => "")).slice(0, 300) };
  }
  return { ok: true, statusCode: res.status };
}
