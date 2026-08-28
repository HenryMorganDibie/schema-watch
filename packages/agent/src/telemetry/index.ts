import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Anonymous, opt-in usage telemetry.
 *
 * This exists to answer one question that npm download counts cannot: is any
 * of this being run by a person? npm counts installs, and CI runners, mirrors,
 * Docker builds and registry caches all install. A download is not a developer.
 *
 * Everything here is off unless someone turns it on. There is no prompt that
 * defaults to yes, no "anonymous statistics" checkbox pre-ticked, and no
 * sampling of people who have not decided. If that makes the numbers small,
 * the numbers are small, and a small honest number is worth more than a large
 * one nobody agreed to.
 *
 * What is deliberately never sent: the target URL, endpoint paths, schemas,
 * payloads, headers, file paths, project names, directory names, IP addresses
 * (the server does not log them), or anything derived from the captured
 * traffic. The whole point of the product is that your API data stays on your
 * machine, and telemetry must not be the exception to that.
 */

const ENDPOINT = process.env.SCHEMA_WATCH_TELEMETRY_URL ?? "https://schema-watch-server-sigma.vercel.app";
const TIMEOUT_MS = 3000;

export type TelemetryEvent = "cli_init" | "cli_start" | "cli_check" | "cli_export" | "cli_context";

interface TelemetryConfig {
  enabled: boolean;
  /** Random per-machine id. Not derived from anything: not hostname, not MAC, not username. */
  installId: string;
  /** Set once the user has actually made a choice, so we only mention it once. */
  decidedAt?: string;
  /**
   * Set only if the developer explicitly ran `telemetry link`. It lets their
   * laptop and their CI runner be counted as one developer instead of two
   * installations. Linking is always optional: telemetry works fully without
   * a Cloud account, because the local-first promise is the point of the
   * product and paywalling anonymity would contradict it.
   */
  linkedTeamId?: string;
}

/**
 * Home directory rather than the project, so the choice belongs to the
 * developer and does not get committed into someone's repository or make the
 * decision on a teammate's behalf.
 */
function configDir(): string {
  return path.join(os.homedir(), ".schema-watch");
}

function configPath(): string {
  return path.join(configDir(), "telemetry.json");
}

export function readTelemetryConfig(): TelemetryConfig {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<TelemetryConfig>;
    return {
      enabled: parsed.enabled === true,
      installId: typeof parsed.installId === "string" ? parsed.installId : randomUUID(),
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : undefined,
      linkedTeamId: typeof parsed.linkedTeamId === "string" ? parsed.linkedTeamId : undefined,
    };
  } catch {
    // Missing, unreadable or corrupt all mean the same thing: not enabled.
    return { enabled: false, installId: randomUUID() };
  }
}

function writeTelemetryConfig(config: TelemetryConfig): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch {
    // A read-only home directory should not break the CLI. The consequence is
    // that telemetry stays off, which is the safe direction to fail in.
  }
}

export function setTelemetryEnabled(enabled: boolean): void {
  const current = readTelemetryConfig();
  writeTelemetryConfig({ ...current, enabled, decidedAt: new Date().toISOString() });
}

/** True once the user has explicitly enabled or disabled, so we stop mentioning it. */
export function hasDecided(): boolean {
  return readTelemetryConfig().decidedAt !== undefined;
}

/**
 * CI is a legitimate installation worth counting: someone who puts the check
 * into a pipeline is a stronger adoption signal than someone who ran it once.
 * It must simply never be *conflated* with a human, which is what the
 * environment tag is for. A fresh runner has no home-directory config, so CI
 * opts in through the environment variable instead.
 */
function environment(): "ci" | "local" {
  return process.env.CI ? "ci" : "local";
}

/**
 * Every reason telemetry stays silent, in one place so it can be read and
 * verified rather than traced through the code.
 */
function suppressedBecause(): string | null {
  // DO_NOT_TRACK is a cross-tool convention; honouring it costs nothing and
  // someone who sets it has already said what they want.
  if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true") {
    return "DO_NOT_TRACK is set";
  }
  if (process.env.SCHEMA_WATCH_TELEMETRY === "0" || process.env.SCHEMA_WATCH_TELEMETRY === "off") {
    return "SCHEMA_WATCH_TELEMETRY is off";
  }
  const envOptIn = process.env.SCHEMA_WATCH_TELEMETRY === "1" || process.env.SCHEMA_WATCH_TELEMETRY === "on";

  // In CI the environment variable is the ONLY way in. A home-directory config
  // can reach a runner by accident (a mounted home, a cached image, a
  // container built from a developer's machine), and a pipeline nobody chose
  // to instrument should not start reporting because of that. Requiring the
  // variable also makes the CI number mean something specific: somebody
  // deliberately turned it on there.
  if (environment() === "ci") return envOptIn ? null : "in CI without SCHEMA_WATCH_TELEMETRY=1";

  if (!envOptIn && !readTelemetryConfig().enabled) return "not enabled";
  return null;
}

export function telemetryStatus(): {
  enabled: boolean;
  installId: string;
  environment: "ci" | "local";
  linkedTeamId?: string;
  suppressedBecause: string | null;
} {
  const config = readTelemetryConfig();
  return {
    enabled: config.enabled,
    installId: config.installId,
    environment: environment(),
    linkedTeamId: config.linkedTeamId,
    suppressedBecause: suppressedBecause(),
  };
}

/**
 * Links this installation to a Cloud account using an API key the developer
 * already has. Deliberately reuses the existing credential rather than adding
 * a second auth flow, and is a separate, explicit action from enabling
 * telemetry: someone may want one without the other.
 */
export async function linkInstallation(apiKey: string): Promise<{ ok: true; teamId: string } | { ok: false; reason: string }> {
  const { installId } = readTelemetryConfig();
  try {
    const res = await fetch(`${ENDPOINT}/api/telemetry/link`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ installId, platform: process.platform, environment: environment() }),
    });
    if (!res.ok) return { ok: false, reason: `server responded ${res.status}` };
    const body = (await res.json()) as { teamId?: string };
    if (!body.teamId) return { ok: false, reason: "no team returned" };
    writeTelemetryConfig({ ...readTelemetryConfig(), linkedTeamId: body.teamId });
    return { ok: true, teamId: body.teamId };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "request failed" };
  }
}

/**
 * Fire and forget. Never awaited by a command, never blocks the CLI, never
 * prints on failure. If the network is down or the endpoint is gone, the tool
 * behaves exactly as it does today.
 */
export function record(event: TelemetryEvent, version: string): void {
  if (suppressedBecause() !== null) return;

  const { installId } = readTelemetryConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  void fetch(`${ENDPOINT}/api/telemetry/cli`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      event,
      installId,
      version,
      // Major only. The full version string is unnecessarily identifying in a
      // small population, and the major is what actually informs support.
      nodeMajor: Number(process.versions.node.split(".")[0]),
      platform: process.platform,
      environment: environment(),
      // Present only when the developer explicitly linked. Anonymous
      // installations stay anonymous: no attempt is made to infer that two
      // machines belong to the same person, because doing so reliably would
      // require collecting more identifying data than this is worth.
      linkedTeamId: readTelemetryConfig().linkedTeamId,
    }),
  })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}

/** Shown once, after the first `init`, so nobody discovers this in a changelog. */
export function firstRunNotice(): string {
  return [
    "",
    "Telemetry is OFF. Schema-Watch sends nothing anywhere unless you turn it on.",
    "",
    "If you would like to tell me this tool is actually being used by a person,",
    "`schema-watch telemetry enable` sends an anonymous id, the command name, the",
    "CLI version, your Node major version and your OS. Never your API traffic,",
    "URLs, schemas, file paths or project names. Nothing is sent from CI unless",
    "you set SCHEMA_WATCH_TELEMETRY=1 there yourself.",
    "",
    "  schema-watch telemetry status    see exactly what would be sent",
    "",
  ].join("\n");
}
