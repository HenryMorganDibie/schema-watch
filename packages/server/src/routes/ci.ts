import type { FastifyInstance } from "fastify";
import type { BodyTarget, SchemaNode } from "@schema-watch/core";
import { ingestSnapshot } from "../lib/diffProject.js";
import { prisma } from "../lib/prisma.js";
import { requireApiKey } from "../plugins/authenticate.js";

interface CiCheckEntry {
  method: string;
  pathPattern: string;
  target: BodyTarget;
  schema: SchemaNode;
}

interface CiCheckBody {
  projectId: string;
  entries: CiCheckEntry[];
}

/**
 * The "block the PR" endpoint. A GitHub Action posts the contract observed in
 * this branch's test run; the response's exit-worthy `pass` field is what the
 * workflow checks before allowing merge.
 *
 * Deliberately available on every plan, including free. Detection is the
 * adoption engine: the more repositories run this, the wider the distribution.
 * The paid tiers sell coordination across repos and teams, not the check
 * itself, and `schema-watch check --baseline` does the same job with no
 * account at all.
 */
export async function ciRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireApiKey);

  app.post<{ Body: CiCheckBody }>("/check", async (req, reply) => {
    const { projectId, entries } = req.body ?? {};
    if (!projectId || !Array.isArray(entries) || entries.length === 0) {
      return reply.code(400).send({ error: "projectId and a non-empty entries[] array are required" });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { team: true } });
    if (!project || project.teamId !== req.teamId) {
      return reply.code(404).send({ error: "project not found" });
    }
    const results = await Promise.all(
      entries.map((entry) =>
        ingestSnapshot({
          projectId: project.id,
          projectName: project.name,
          method: entry.method,
          pathPattern: entry.pathPattern,
          target: entry.target,
          schema: entry.schema,
        }),
      ),
    );

    const breakingChanges = results
      .filter((r) => r.change?.severity === "BREAKING")
      .map((r) => ({ endpointId: r.endpointId, changes: r.change!.changes, affectedFiles: r.change!.affectedFiles }));

    return reply.send({ pass: breakingChanges.length === 0, breakingChanges });
  });
}
