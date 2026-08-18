import type { FastifyInstance } from "fastify";
import type { ChangeSeverity } from "@prisma/client";
import { requireMembership } from "../lib/membership.js";
import { deliverToIntegration, validateWebhookUrl } from "../lib/notify/index.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../plugins/authenticate.js";

type WebhookType = "SLACK" | "DISCORD";

interface CreateIntegrationBody {
  type: WebhookType | "GITHUB";
  webhookUrl?: string;
  minSeverity?: ChangeSeverity;
}

const SEVERITIES: ChangeSeverity[] = ["BREAKING", "WARNING", "INFO"];

interface IntegrationRow {
  id: string;
  type: string;
  enabled: boolean;
  minSeverity: ChangeSeverity;
  consecutiveFailures: number;
  lastError: string | null;
  lastDeliveryAt: Date | null;
  config: unknown;
  createdAt: Date;
}

/** Never returns the webhook URL: it is a credential that grants posting rights. */
function serialize(i: IntegrationRow) {
  const config = i.config as { webhookUrl?: string };
  let host: string | null = null;
  try {
    host = config.webhookUrl ? new URL(config.webhookUrl).host : null;
  } catch {
    host = null;
  }

  return {
    id: i.id,
    type: i.type,
    enabled: i.enabled,
    minSeverity: i.minSeverity,
    consecutiveFailures: i.consecutiveFailures,
    lastError: i.lastError,
    lastDeliveryAt: i.lastDeliveryAt,
    // Enough to recognise which webhook this is, without handing it back out.
    webhookHost: host,
    createdAt: i.createdAt,
  };
}

async function projectForUser(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { team: true } });
  if (!project) return null;
  const membership = await requireMembership(userId, project.teamId, ["OWNER", "ADMIN"]);
  return membership ? project : null;
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get<{ Params: { projectId: string } }>("/projects/:projectId/integrations", async (req, reply) => {
    const project = await projectForUser(req.userId!, req.params.projectId);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const integrations = await prisma.integration.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(integrations.map(serialize));
  });

  app.post<{ Params: { projectId: string }; Body: CreateIntegrationBody }>(
    "/projects/:projectId/integrations",
    async (req, reply) => {
      const project = await projectForUser(req.userId!, req.params.projectId);
      if (!project) return reply.code(404).send({ error: "project not found" });
      if (project.team.plan === "FREE") {
        return reply.code(402).send({ error: "Slack and Discord alerts require a Pro or Team plan" });
      }

      const { type, webhookUrl, minSeverity = "BREAKING" } = req.body ?? {};

      // GITHUB is a legacy enum value. Rather than accept a setting that
      // would silently never fire, point at where the working feature lives.
      if (type === "GITHUB") {
        return reply.code(400).send({
          error:
            "GitHub is handled by the Schema-Watch GitHub Action, which posts PR comments and check runs for free. See examples/github-action.",
        });
      }
      if (type !== "SLACK" && type !== "DISCORD") {
        return reply.code(400).send({ error: "type must be SLACK or DISCORD" });
      }
      if (!webhookUrl) return reply.code(400).send({ error: "webhookUrl is required" });
      if (!SEVERITIES.includes(minSeverity)) {
        return reply.code(400).send({ error: `minSeverity must be one of ${SEVERITIES.join(", ")}` });
      }

      const valid = validateWebhookUrl(type, webhookUrl);
      if (!valid.ok) return reply.code(400).send({ error: valid.error });

      const integration = await prisma.integration.create({
        data: { projectId: project.id, type, config: { webhookUrl }, minSeverity },
      });

      return reply.code(201).send(serialize(integration));
    },
  );

  /**
   * Sends a real message through the configured webhook. Without this a user
   * cannot tell a working integration from a typo until the next breaking
   * change, which is the worst possible moment to find out.
   */
  app.post<{ Params: { projectId: string; integrationId: string } }>(
    "/projects/:projectId/integrations/:integrationId/test",
    async (req, reply) => {
      const project = await projectForUser(req.userId!, req.params.projectId);
      if (!project) return reply.code(404).send({ error: "project not found" });

      const integration = await prisma.integration.findFirst({
        where: { id: req.params.integrationId, projectId: project.id },
      });
      if (!integration) return reply.code(404).send({ error: "integration not found" });

      const outcome = await deliverToIntegration(integration, {
        projectName: project.name,
        method: "GET",
        pathPattern: "/api/example/:id",
        target: "response",
        severity: "BREAKING",
        changes: [{ kind: "type-changed", path: "userId", severity: "BREAKING", before: "string", after: "number" }],
        affectedFiles: ["src/components/UserCard.tsx"],
        isTest: true,
      });

      if (!outcome.ok) {
        return reply.code(502).send({ error: outcome.error ?? "delivery failed", statusCode: outcome.statusCode });
      }
      return reply.send({ delivered: true });
    },
  );

  app.get<{ Params: { projectId: string; integrationId: string } }>(
    "/projects/:projectId/integrations/:integrationId/deliveries",
    async (req, reply) => {
      const project = await projectForUser(req.userId!, req.params.projectId);
      if (!project) return reply.code(404).send({ error: "project not found" });

      const integration = await prisma.integration.findFirst({
        where: { id: req.params.integrationId, projectId: project.id },
        select: { id: true },
      });
      if (!integration) return reply.code(404).send({ error: "integration not found" });

      const deliveries = await prisma.integrationDelivery.findMany({
        where: { integrationId: integration.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return reply.send(deliveries);
    },
  );

  app.patch<{
    Params: { projectId: string; integrationId: string };
    Body: { enabled?: boolean; minSeverity?: ChangeSeverity };
  }>("/projects/:projectId/integrations/:integrationId", async (req, reply) => {
    const project = await projectForUser(req.userId!, req.params.projectId);
    if (!project) return reply.code(404).send({ error: "project not found" });

    const { enabled, minSeverity } = req.body ?? {};
    if (minSeverity && !SEVERITIES.includes(minSeverity)) {
      return reply.code(400).send({ error: `minSeverity must be one of ${SEVERITIES.join(", ")}` });
    }

    const existing = await prisma.integration.findFirst({
      where: { id: req.params.integrationId, projectId: project.id },
    });
    if (!existing) return reply.code(404).send({ error: "integration not found" });

    const updated = await prisma.integration.update({
      where: { id: existing.id },
      data: {
        // Re-enabling clears the failure count, otherwise a webhook that was
        // auto-disabled would trip again on its next single failure.
        ...(enabled === undefined ? {} : { enabled, ...(enabled ? { consecutiveFailures: 0, lastError: null } : {}) }),
        ...(minSeverity ? { minSeverity } : {}),
      },
    });
    return reply.send(serialize(updated));
  });

  app.delete<{ Params: { projectId: string; integrationId: string } }>(
    "/projects/:projectId/integrations/:integrationId",
    async (req, reply) => {
      const project = await projectForUser(req.userId!, req.params.projectId);
      if (!project) return reply.code(404).send({ error: "project not found" });

      const existing = await prisma.integration.findFirst({
        where: { id: req.params.integrationId, projectId: project.id },
      });
      if (!existing) return reply.code(404).send({ error: "integration not found" });

      await prisma.integration.delete({ where: { id: existing.id } });
      return reply.code(204).send();
    },
  );
}
