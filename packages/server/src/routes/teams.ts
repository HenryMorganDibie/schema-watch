import type { FastifyInstance } from "fastify";
import { generateApiKey } from "../lib/apiKey.js";
import { requireMembership } from "../lib/membership.js";
import { prisma } from "../lib/prisma.js";
import { requireUser, requireVerifiedEmail } from "../plugins/authenticate.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post<{ Body: { name: string } }>("/", async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "team name is required" });

    const baseSlug = slugify(name) || "team";
    let slug = baseSlug;
    for (let i = 1; await prisma.team.findUnique({ where: { slug } }); i++) slug = `${baseSlug}-${i}`;

    const team = await prisma.team.create({
      data: {
        name,
        slug,
        members: { create: { userId: req.userId!, role: "OWNER" } },
      },
    });

    return reply.code(201).send(team);
  });

  app.post<{ Params: { teamId: string }; Body: { email: string; role?: "ADMIN" | "MEMBER" } }>(
    "/:teamId/members",
    async (req, reply) => {
      const membership = await requireMembership(req.userId!, req.params.teamId, ["OWNER", "ADMIN"]);
      if (!membership) return reply.code(403).send({ error: "only team owners/admins can add members" });

      const { email, role = "MEMBER" } = req.body ?? {};
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return reply.code(404).send({ error: "no account with that email exists yet" });

      const added = await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: req.params.teamId, userId: user.id } },
        create: { teamId: req.params.teamId, userId: user.id, role },
        update: { role },
      });
      return reply.code(201).send(added);
    },
  );

  app.post<{ Params: { teamId: string }; Body: { label: string } }>(
    "/:teamId/api-keys",
    { preHandler: requireVerifiedEmail },
    async (req, reply) => {
      const membership = await requireMembership(req.userId!, req.params.teamId, ["OWNER", "ADMIN"]);
      if (!membership) return reply.code(403).send({ error: "only team owners/admins can create API keys" });

      const { plainText, hash } = generateApiKey();
      const label = req.body?.label?.trim() || "unnamed key";
      const created = await prisma.apiKey.create({ data: { teamId: req.params.teamId, label, keyHash: hash } });

      // plainText is only ever returned here - the server stores the hash, never the key itself.
      return reply.code(201).send({ id: created.id, label: created.label, key: plainText });
    },
  );

  app.get<{ Params: { teamId: string } }>("/:teamId/api-keys", async (req, reply) => {
    const membership = await requireMembership(req.userId!, req.params.teamId, ["OWNER", "ADMIN", "MEMBER"]);
    if (!membership) return reply.code(403).send({ error: "not a member of this team" });

    const keys = await prisma.apiKey.findMany({
      where: { teamId: req.params.teamId },
      select: { id: true, label: true, lastUsedAt: true, createdAt: true },
    });
    return reply.send(keys);
  });
}
