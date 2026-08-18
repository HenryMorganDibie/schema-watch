import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiscordPayload } from "./discord.js";
import { buildSlackPayload } from "./slack.js";
import { meetsThreshold, type ContractChangeNotification } from "./types.js";
import { validateWebhookUrl } from "./index.js";

const notification: ContractChangeNotification = {
  projectName: "Laetiva API",
  method: "GET",
  pathPattern: "/api/users/:id",
  target: "response",
  severity: "BREAKING",
  changes: [{ kind: "type-changed", path: "userId", severity: "BREAKING", before: "string", after: "number" }],
  affectedFiles: ["src/components/UserCard.tsx"],
};

test("slack payload uses the text field slack expects", () => {
  const payload = buildSlackPayload(notification) as { text: string };
  assert.ok(typeof payload.text === "string");
  assert.ok(payload.text.includes("/api/users/:id"));
  assert.ok(payload.text.includes("userId: string"));
  assert.ok(payload.text.includes("UserCard.tsx"));
});

test("discord payload uses embeds, not slack's text field", () => {
  // Discord rejects {text: ...} outright, which is why sending the Slack
  // payload to a Discord webhook could never have worked.
  const payload = buildDiscordPayload(notification) as { embeds: unknown[]; text?: string };
  assert.equal(payload.text, undefined);
  assert.equal(payload.embeds.length, 1);

  const embed = payload.embeds[0] as { title: string; color: number; fields: { name: string; value: string }[] };
  assert.ok(embed.title.includes("BREAKING"));
  assert.equal(typeof embed.color, "number");
  assert.ok(embed.fields.some((f) => f.value.includes("/api/users/:id")));
  assert.ok(embed.fields.some((f) => f.name.startsWith("Affected files")));
});

test("a test send is labelled so it does not read as a real incident", () => {
  const slack = buildSlackPayload({ ...notification, isTest: true }) as { text: string };
  assert.ok(slack.text.toLowerCase().includes("test"));

  const discord = buildDiscordPayload({ ...notification, isTest: true }) as { embeds: { title: string }[] };
  assert.ok(discord.embeds[0]!.title.toLowerCase().includes("test"));
});

test("severity threshold only lets through changes at or above the minimum", () => {
  assert.equal(meetsThreshold("BREAKING", "BREAKING"), true);
  assert.equal(meetsThreshold("WARNING", "BREAKING"), false);
  assert.equal(meetsThreshold("INFO", "BREAKING"), false);
  assert.equal(meetsThreshold("BREAKING", "INFO"), true);
  assert.equal(meetsThreshold("WARNING", "WARNING"), true);
});

test("webhook URLs are restricted to each provider's own host", () => {
  assert.equal(validateWebhookUrl("SLACK", "https://hooks.slack.com/services/T/B/x").ok, true);
  assert.equal(validateWebhookUrl("DISCORD", "https://discord.com/api/webhooks/1/x").ok, true);

  // A Slack URL in a Discord integration would fail on every send; catching
  // it at creation turns a silent dead webhook into an immediate error.
  assert.equal(validateWebhookUrl("DISCORD", "https://hooks.slack.com/services/T/B/x").ok, false);
  assert.equal(validateWebhookUrl("SLACK", "https://discord.com/api/webhooks/1/x").ok, false);
});

test("webhook URLs cannot point at internal addresses or plain http", () => {
  // Also an SSRF guard: the server fetches these URLs.
  assert.equal(validateWebhookUrl("SLACK", "http://hooks.slack.com/services/T/B/x").ok, false);
  assert.equal(validateWebhookUrl("SLACK", "https://169.254.169.254/latest/meta-data").ok, false);
  assert.equal(validateWebhookUrl("DISCORD", "https://localhost:8080/webhook").ok, false);
  assert.equal(validateWebhookUrl("SLACK", "not-a-url").ok, false);
});
