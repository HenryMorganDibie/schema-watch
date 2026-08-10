import type { FastifyInstance } from "fastify";
import { requireMembership } from "../lib/membership.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../plugins/authenticate.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function assertProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { project: null, membership: null };
  const membership = await requireMembership(userId, project.teamId, ["OWNER", "ADMIN", "MEMBER"]);
  return { project, membership };
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post<{ Params: { teamId: string }; Body: { name: string } }>("/teams/:teamId/projects", async (req, reply) => {
    const membership = await requireMembership(req.userId!, req.params.teamId, ["OWNER", "ADMIN"]);
    if (!membership) return reply.code(403).send({ error: "only team owners/admins can create projects" });

    const { name } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "project name is required" });

    const baseSlug = slugify(name) || "project";
    let slug = baseSlug;
    for (let i = 1; await prisma.project.findUnique({ where: { teamId_slug: { teamId: req.params.teamId, slug } } }); i++) {
      slug = `${baseSlug}-${i}`;
    }

    const project = await prisma.project.create({ data: { name, slug, teamId: req.params.teamId } });
    return reply.code(201).send(project);
  });

  app.get<{ Params: { teamId: string } }>("/teams/:teamId/projects", async (req, reply) => {
    const membership = await requireMembership(req.userId!, req.params.teamId, ["OWNER", "ADMIN", "MEMBER"]);
    if (!membership) return reply.code(403).send({ error: "not a member of this team" });
    return reply.send(await prisma.project.findMany({ where: { teamId: req.params.teamId } }));
  });

  app.get<{ Params: { projectId: string } }>("/projects/:projectId/endpoints", async (req, reply) => {
    const { project, membership } = await assertProjectAccess(req.userId!, req.params.projectId);
    if (!project || !membership) return reply.code(404).send({ error: "project not found" });

    const endpoints = await prisma.endpoint.findMany({
      where: { projectId: project.id },
      include: {
        changes: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { changes: true } },
      },
    });

    return reply.send(
      endpoints.map((e) => ({
        id: e.id,
        method: e.method,
        pathPattern: e.pathPattern,
        latestSeverity: e.changes[0]?.severity ?? null,
        changeCount: e._count.changes,
      })),
    );
  });

  app.get<{ Params: { endpointId: string } }>("/endpoints/:endpointId/changes", async (req, reply) => {
    const endpoint = await prisma.endpoint.findUnique({ where: { id: req.params.endpointId } });
    if (!endpoint) return reply.code(404).send({ error: "endpoint not found" });
    const { membership } = await assertProjectAccess(req.userId!, endpoint.projectId);
    if (!membership) return reply.code(403).send({ error: "not a member of this team" });

    const changes = await prisma.contractChange.findMany({
      where: { endpointId: endpoint.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return reply.send(changes);
  });
}
