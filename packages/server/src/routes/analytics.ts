import type { FastifyInstance } from "fastify";
import {
  CLIENT_EVENTS,
  recordEvent,
  referrerHostOf,
  type AnalyticsEventName,
} from "../lib/analytics.js";
import { analyticsSummary, type RangeDays } from "../lib/analyticsQueries.js";
import { githubTraffic } from "../lib/githubTraffic.js";
import { adoptionSummary } from "../lib/adoptionQueries.js";
import { npmDownloads } from "../lib/npmDownloads.js";
import { retentionCohorts } from "../lib/retention.js";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "../lib/rateLimit.js";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { requirePlatformAdmin, requireUser } from "../plugins/authenticate.js";

const VALID_RANGES: RangeDays[] = [7, 30, 90];

function parseRange(raw: unknown): RangeDays {
  const n = Number(raw);
  return (VALID_RANGES as number[]).includes(n) ? (n as RangeDays) : 30;
}

interface IngestBody {
  eventName: string;
  anonymousVisitorId?: string;
  sessionId?: string;
  route?: string;
}

/**
 * Public ingest, used only by the browser.
 *
 * A visitor may submit page views and CTA clicks and nothing else: the
 * allowlist keeps a hostile client from forging a login or inflating CI
 * usage, both of which are recorded server-side where they actually happen.
 */
export async function analyticsIngestRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: IngestBody }>("/events", async (req, reply) => {
    // Shares the signup limiter's budget: cheap to call, so worth bounding.
    if (await enforceRateLimit(req, reply, RATE_LIMITS.analyticsByIp, clientIp(req))) return;

    const { eventName, anonymousVisitorId, sessionId, route } = req.body ?? {};
    if (!eventName || !CLIENT_EVENTS.includes(eventName)) {
      return reply.code(400).send({ error: "unknown event" });
    }

    // Associate with the signed-in user when a valid token happens to be
    // present, but never require one - most of these events are anonymous.
    let userId: string | null = null;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const payload = verifyToken(header.slice("Bearer ".length));
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, tokenVersion: true },
        });
        if (user && user.tokenVersion === payload.tokenVersion) userId = user.id;
      } catch {
        // An invalid token simply means the event stays anonymous.
      }
    }

    await recordEvent({
      eventName: eventName as AnalyticsEventName,
      anonymousVisitorId,
      sessionId,
      userId,
      route,
      referrerHost: referrerHostOf(req.headers.referer),
    });

    return reply.code(202).send({ recorded: true });
  });
}

/**
 * Read side. Operator only, and enforced here rather than by hiding the page:
 * both hooks run before any handler, and non-admins get 404 so the surface is
 * not advertised.
 */
export async function analyticsAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);
  app.addHook("preHandler", requirePlatformAdmin);

  app.get<{ Querystring: { range?: string } }>("/summary", async (req, reply) => {
    const range = parseRange(req.query.range);
    const summary = await analyticsSummary(range);
    return reply.send({ range, ...summary });
  });

  /**
   * Separate from /summary on purpose. This one depends on a third party, so
   * it gets its own request: GitHub being slow or down degrades this panel
   * alone instead of taking the first-party dashboard with it.
   */
  app.get("/github", async (_req, reply) => {
    return reply.send(await githubTraffic());
  });

  /**
   * Also its own request. Retention scans further back than the summary
   * window does, so it has no business making the headline numbers wait.
   */
  /**
   * The adoption funnel. Separate from /summary because it mixes a third-party
   * number (npm) with first-party telemetry, and those must stay labelled.
   */
  app.get("/adoption", async (_req, reply) => {
    const npm = await npmDownloads();
    return reply.send(await adoptionSummary(npm.available ? npm.lastMonth : null));
  });

  app.get("/npm", async (_req, reply) => {
    return reply.send(await npmDownloads());
  });

  app.get("/retention", async (_req, reply) => {
    return reply.send(await retentionCohorts());
  });
}
