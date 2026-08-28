import cors from "@fastify/cors";
import Fastify from "fastify";
import { adminRoutes } from "./routes/admin.js";
import { analyticsAdminRoutes, analyticsIngestRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { badgeRoutes } from "./routes/badge.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { billingRoutes } from "./routes/billing.js";
import { ciRoutes } from "./routes/ci.js";
import { integrationRoutes } from "./routes/integrations.js";
import { projectRoutes } from "./routes/projects.js";
import { snapshotRoutes } from "./routes/snapshots.js";
import { teamRoutes } from "./routes/teams.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Raw body bytes, needed to verify the Stripe webhook signature. */
    rawBody?: Buffer;
  }
}

export function buildApp() {
  const app = Fastify({ logger: true });

  // Parse JSON as usual but stash the raw bytes too - the Stripe webhook
  // handler needs the exact bytes Stripe signed, not a re-serialized copy.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    if (body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString("utf-8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // An allowlist rather than reflecting whatever Origin arrives. Harmless
  // today because auth is a bearer token that no browser attaches
  // automatically, but reflecting any origin is exactly what makes a later
  // move to cookie sessions unsafe. APP_URL is the deployed app; localhost
  // covers development. Requests with no Origin (curl, the agent, CI) are
  // unaffected.
  const allowedOrigins = [
    process.env.APP_URL,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5199",
  ].filter((o): o is string => Boolean(o));

  app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  });

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(analyticsAdminRoutes, { prefix: "/api/admin/analytics" });
  app.register(analyticsIngestRoutes, { prefix: "/api/analytics" });
  app.register(teamRoutes, { prefix: "/api/teams" });
  app.register(projectRoutes, { prefix: "/api" });
  app.register(snapshotRoutes, { prefix: "/api" });
  app.register(ciRoutes, { prefix: "/api/ci" });
  app.register(integrationRoutes, { prefix: "/api" });
  app.register(billingRoutes, { prefix: "/api/billing" });
  app.register(badgeRoutes, { prefix: "/api/badge" });
  app.register(telemetryRoutes, { prefix: "/api/telemetry" });

  app.get("/api/health", async () => ({ ok: true }));

  // The API root is reachable in a browser, so answer with something honest
  // rather than a bare 404. This is also the canary for routing being wired
  // correctly: if it 500s, requests are not reaching this app at all.
  app.get("/", async () => ({
    service: "schema-watch-api",
    docs: "https://github.com/HenryMorganDibie/schema-watch",
  }));

  return app;
}
