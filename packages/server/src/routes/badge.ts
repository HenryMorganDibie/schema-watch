import type { FastifyInstance } from "fastify";
import { renderBadgeSvg } from "../lib/badge.js";
import { prisma } from "../lib/prisma.js";

const BREAKING_COLOR = "#d03b3b";
const WARNING_COLOR = "#d98300";
const STABLE_COLOR = "#0ca30c";
const UNKNOWN_COLOR = "#9f9f9f";

/** Public, unauthenticated - meant to be embedded as an <img> in a GitHub
 * README next to the CI badge, so it has to load with no auth handshake. */
export async function badgeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>("/:projectId.svg", async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });

    reply.header("content-type", "image/svg+xml");
    reply.header("cache-control", "no-cache, max-age=0");

    if (!project) {
      return reply.send(renderBadgeSvg("schema-watch", "unknown project", UNKNOWN_COLOR));
    }

    const [breakingCount, warningCount] = await Promise.all([
      prisma.contractChange.count({ where: { endpoint: { projectId: project.id }, severity: "BREAKING", acknowledged: false } }),
      prisma.contractChange.count({ where: { endpoint: { projectId: project.id }, severity: "WARNING", acknowledged: false } }),
    ]);

    if (breakingCount > 0) {
      return reply.send(renderBadgeSvg("contracts", `${breakingCount} breaking`, BREAKING_COLOR));
    }
    if (warningCount > 0) {
      return reply.send(renderBadgeSvg("contracts", `${warningCount} warning${warningCount === 1 ? "" : "s"}`, WARNING_COLOR));
    }
    return reply.send(renderBadgeSvg("contracts", "stable", STABLE_COLOR));
  });
}
