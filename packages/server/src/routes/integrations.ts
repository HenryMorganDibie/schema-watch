import type { FastifyInstance } from "fastify";
import { requireMembership } from "../lib/membership.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../plugins/authenticate.js";

interface CreateIntegrationBody {
  type: "SLACK" | "DISCORD" | "GITHUB";
  webhookUrl?: string;
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post<{ Params: { projectId: string }; Body: CreateIntegrationBody }>(
    "/projects/:projectId/integrations",
    async (req, reply) => {
      const project = await prisma.project.findUnique({ where: { id: req.params.projectId }, include: { team: true } });
      if (!project) return reply.code(404).send({ error: "project not found" });

      const membership = await requireMembership(req.userId!, project.teamId, ["OWNER", "ADMIN"]);
      if (!membership) return reply.code(403).send({ error: "only team owners/admins can manage integrations" });
      if (project.team.plan === "FREE") {
        return reply.code(402).send({ error: "Slack/Discord alerts require a Pro or Team plan" });
      }

      const { type, webhookUrl } = req.body ?? {};
      if (!type || !webhookUrl) return reply.code(400).send({ error: "type and webhookUrl are required" });

      const integration = await prisma.integration.create({
        data: { projectId: project.id, type, config: { webhookUrl } },
      });
      return reply.code(201).send(integration);
    },
  );

  app.delete<{ Params: { integrationId: string } }>("/integrations/:integrationId", async (req, reply) => {
    const integration = await prisma.integration.findUnique({
      where: { id: req.params.integrationId },
      include: { project: true },
    });
    if (!integration) return reply.code(404).send({ error: "not found" });

    const membership = await requireMembership(req.userId!, integration.project.teamId, ["OWNER", "ADMIN"]);
    if (!membership) return reply.code(403).send({ error: "only team owners/admins can manage integrations" });

    await prisma.integration.delete({ where: { id: integration.id } });
    return reply.code(204).send();
  });
}
