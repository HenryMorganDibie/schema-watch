import type { Integration } from "@prisma/client";
import { prisma } from "../prisma.js";
import { DISCORD_WEBHOOK_HOSTS, deliverDiscord } from "./discord.js";
import { SLACK_WEBHOOK_HOST, deliverSlack } from "./slack.js";
import { meetsThreshold, type ContractChangeNotification, type DeliveryOutcome } from "./types.js";

export * from "./types.js";
export { buildSlackPayload } from "./slack.js";
export { buildDiscordPayload } from "./discord.js";

/** Disable a webhook after this many consecutive failures. */
const FAILURE_LIMIT = 5;

/**
 * Webhook URLs are user-supplied and fetched by the server, so restricting
 * them to the providers' own hosts is both a correctness check (a Slack URL
 * pasted into a Discord integration would always fail) and an SSRF guard: it
 * stops the API being pointed at internal addresses.
 */
export function validateWebhookUrl(type: string, rawUrl: string): { ok: true } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https." };

  if (type === "SLACK" && url.hostname !== SLACK_WEBHOOK_HOST) {
    return { ok: false, error: `Slack webhooks must be on ${SLACK_WEBHOOK_HOST}.` };
  }
  if (type === "DISCORD" && !DISCORD_WEBHOOK_HOSTS.includes(url.hostname)) {
    return { ok: false, error: "Discord webhooks must be on discord.com." };
  }
  return { ok: true };
}

async function deliverOne(integration: Integration, n: ContractChangeNotification): Promise<DeliveryOutcome> {
  const config = integration.config as { webhookUrl?: string };
  if (!config.webhookUrl) return { ok: false, error: "no webhook URL configured" };

  try {
    return integration.type === "DISCORD"
      ? await deliverDiscord(config.webhookUrl, n)
      : await deliverSlack(config.webhookUrl, n);
  } catch (err) {
    // Network error, DNS failure, or the 10s timeout.
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

/**
 * Attempts one delivery and records the outcome, so a user can see that a
 * notification failed instead of assuming their team was alerted.
 */
export async function deliverToIntegration(
  integration: Integration,
  n: ContractChangeNotification,
): Promise<DeliveryOutcome> {
  const outcome = await deliverOne(integration, n);
  const summary = n.isTest ? "Test message" : `${n.severity} ${n.method} ${n.pathPattern}`;

  await prisma.integrationDelivery.create({
    data: {
      integrationId: integration.id,
      status: outcome.ok ? "SUCCESS" : "FAILED",
      statusCode: outcome.statusCode,
      summary,
      error: outcome.error,
    },
  });

  const failures = outcome.ok ? 0 : integration.consecutiveFailures + 1;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastDeliveryAt: new Date(),
      lastError: outcome.ok ? null : outcome.error,
      consecutiveFailures: failures,
      // A webhook deleted on the far end fails forever; stop retrying it on
      // every contract change and surface it as disabled instead.
      enabled: failures >= FAILURE_LIMIT ? false : integration.enabled,
    },
  });

  return outcome;
}

/**
 * Fans a contract change out to every enabled integration on the project
 * whose severity threshold it meets.
 *
 * Deliveries run in parallel and never throw: a broken webhook must not fail
 * the snapshot ingest that triggered it.
 */
export async function notifyProject(projectId: string, n: ContractChangeNotification): Promise<void> {
  const integrations = await prisma.integration.findMany({
    where: { projectId, enabled: true, type: { in: ["SLACK", "DISCORD"] } },
  });

  const targets = integrations.filter((i) => meetsThreshold(n.severity, i.minSeverity));
  if (targets.length === 0) return;

  await Promise.allSettled(targets.map((i) => deliverToIntegration(i, n)));
}
