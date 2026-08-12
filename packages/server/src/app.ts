import cors from "@fastify/cors";
import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { badgeRoutes } from "./routes/badge.js";
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

  app.register(cors, { origin: true });

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(teamRoutes, { prefix: "/api/teams" });
  app.register(projectRoutes, { prefix: "/api" });
  app.register(snapshotRoutes, { prefix: "/api" });
  app.register(ciRoutes, { prefix: "/api/ci" });
  app.register(integrationRoutes, { prefix: "/api" });
  app.register(billingRoutes, { prefix: "/api/billing" });
  app.register(badgeRoutes, { prefix: "/api/badge" });

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
