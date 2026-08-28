import type { FastifyInstance } from "fastify";
import { hashApiKey } from "../lib/apiKey.js";
import { prisma } from "../lib/prisma.js";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "../lib/rateLimit.js";

/**
 * Ingest for the CLI's opt-in telemetry.
 *
 * Public and unauthenticated, because the whole point is to hear from people
 * who have no account. That makes it forgeable, which is acceptable: this
 * measures adoption, not billing, and nothing here grants access to anything.
 * It is rate limited so it cannot be used to fill the database.
 *
 * Deliberately not recorded: IP addresses, user agents, hostnames, or anything
 * that could re-identify a machine beyond the random id it sends. The events
 * carry no API data of any kind, because the CLI never sends any.
 */

const EVENTS = new Set(["cli_init", "cli_start", "cli_check", "cli_export", "cli_context"]);
const ENVIRONMENTS = new Set(["local", "ci"]);

interface CliBody {
  event?: string;
  installId?: string;
  version?: string;
  nodeMajor?: number;
  platform?: string;
  environment?: string;
  linkedTeamId?: string;
}

interface LinkBody {
  installId?: string;
  platform?: string;
  environment?: string;
}

/** A random uuid from the CLI. Anything else is a client we do not recognise. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CliBody }>("/cli", async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.telemetryByIp, clientIp(req))) return;

    const { event, installId, version, nodeMajor, platform, environment, linkedTeamId } = req.body ?? {};
    if (!event || !EVENTS.has(event)) return reply.code(400).send({ error: "unknown event" });
    if (!installId || !UUID.test(installId)) return reply.code(400).send({ error: "invalid installId" });

    const env = environment && ENVIRONMENTS.has(environment) ? environment : "local";
    const safeVersion = typeof version === "string" ? version.slice(0, 32) : null;
    const safePlatform = typeof platform === "string" ? platform.slice(0, 32) : null;
    const safeNodeMajor = Number.isInteger(nodeMajor) ? (nodeMajor as number) : null;

    // A link is only honoured if the team actually exists. A client can claim
    // any id, and must not be able to attach itself to someone else's team, so
    // an unknown id degrades to anonymous rather than erroring.
    let teamId: string | null = null;
    if (typeof linkedTeamId === "string" && linkedTeamId.length <= 64) {
      const team = await prisma.team.findUnique({ where: { id: linkedTeamId }, select: { id: true } });
      teamId = team?.id ?? null;
    }

    await prisma.telemetryInstallation.upsert({
      where: { installId },
      create: {
        installId,
        version: safeVersion,
        platform: safePlatform,
        nodeMajor: safeNodeMajor,
        environment: env,
        teamId,
      },
      update: {
        lastSeenAt: new Date(),
        version: safeVersion,
        platform: safePlatform,
        nodeMajor: safeNodeMajor,
        environment: env,
        // Never clear an existing link just because one request omitted it.
        ...(teamId ? { teamId } : {}),
      },
    });

    await prisma.telemetryEvent.create({
      data: { installId, event, version: safeVersion, environment: env },
    });

    return reply.code(202).send({ recorded: true });
  });

  /**
   * Links an installation to the team owning the supplied API key, so a
   * developer's laptop and CI runner count as one developer rather than two
   * installations. Requires a real credential precisely because it moves an
   * installation out of the anonymous pool.
   */
  app.post<{ Body: LinkBody }>("/link", async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.telemetryByIp, clientIp(req))) return;

    const header = req.headers["x-api-key"];
    if (typeof header !== "string" || !header) return reply.code(401).send({ error: "missing api key" });

    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(header) },
      select: { teamId: true },
    });
    if (!key) return reply.code(401).send({ error: "invalid api key" });

    const { installId, platform, environment } = req.body ?? {};
    if (!installId || !UUID.test(installId)) return reply.code(400).send({ error: "invalid installId" });
    const env = environment && ENVIRONMENTS.has(environment) ? environment : "local";

    await prisma.telemetryInstallation.upsert({
      where: { installId },
      create: {
        installId,
        platform: typeof platform === "string" ? platform.slice(0, 32) : null,
        environment: env,
        teamId: key.teamId,
      },
      update: { teamId: key.teamId, lastSeenAt: new Date() },
    });

    return reply.send({ teamId: key.teamId });
  });
}
