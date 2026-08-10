import type { FastifyInstance } from "fastify";
import type { BodyTarget, SchemaNode } from "@schema-watch/core";
import { ingestSnapshot } from "../lib/diffProject.js";
import { prisma } from "../lib/prisma.js";
import { requireApiKey } from "../plugins/authenticate.js";

interface SnapshotBody {
  method: string;
  pathPattern: string;
  target: BodyTarget;
  statusCode?: number;
  schema: SchemaNode;
  affectedFiles?: string[];
}

/** Where the agent's optional sync mode (and any future CI integration) pushes
 * schema shapes for cloud history, Slack alerts, and multi-project dashboards. */
export async function snapshotRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireApiKey);

  app.post<{ Params: { projectId: string }; Body: SnapshotBody }>("/projects/:projectId/snapshots", async (req, reply) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project || project.teamId !== req.teamId) {
      return reply.code(404).send({ error: "project not found" });
    }

    const { method, pathPattern, target, statusCode, schema, affectedFiles } = req.body ?? {};
    if (!method || !pathPattern || !target || !schema) {
      return reply.code(400).send({ error: "method, pathPattern, target, and schema are required" });
    }

    const result = await ingestSnapshot({
      projectId: project.id,
      projectName: project.name,
      method,
      pathPattern,
      target,
      statusCode,
      schema,
      affectedFiles,
    });

    return reply.code(202).send(result);
  });
}
