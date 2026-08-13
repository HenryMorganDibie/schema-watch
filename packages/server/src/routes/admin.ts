import type { FastifyInstance } from "fastify";
import type { Plan } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requirePlatformAdmin, requireUser } from "../plugins/authenticate.js";

const VALID_PLANS: Plan[] = ["FREE", "PRO", "TEAM"];

/**
 * Operator-only. Lets a plan be granted after payment by bank transfer, which
 * is how the first customers are served while a payment processor is still
 * being set up.
 *
 * This exists so granting a plan is a deliberate, logged API call rather than
 * an ad-hoc edit against the production database.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);
  app.addHook("preHandler", requirePlatformAdmin);

  app.get("/teams", async (_req, reply) => {
    const teams = await prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { email: true, emailVerified: true } } } },
        _count: { select: { projects: true } },
      },
    });

    return reply.send(
      teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        plan: team.plan,
        billingProvider: team.billingProvider,
        projectCount: team._count.projects,
        createdAt: team.createdAt,
        members: team.members.map((m) => ({
          email: m.user.email,
          role: m.role,
          emailVerified: m.user.emailVerified,
        })),
      })),
    );
  });

  app.post<{ Params: { teamId: string }; Body: { plan: Plan; manual?: boolean } }>(
    "/teams/:teamId/plan",
    async (req, reply) => {
      const { plan, manual = true } = req.body ?? {};
      if (!plan || !VALID_PLANS.includes(plan)) {
        return reply.code(400).send({ error: `plan must be one of ${VALID_PLANS.join(", ")}` });
      }

      const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
      if (!team) return reply.code(404).send({ error: "team not found" });

      const updated = await prisma.team.update({
        where: { id: team.id },
        data: {
          plan,
          // Downgrades clear the marker; a manual grant records how it was paid.
          billingProvider: plan === "FREE" ? null : manual ? "MANUAL" : team.billingProvider,
        },
      });

      // Money changed hands here, so leave a trail in the logs even though
      // there is no audit table yet.
      req.log.info(
        { teamId: team.id, from: team.plan, to: plan, actor: req.userId },
        "platform admin changed a team plan",
      );

      return reply.send({ id: updated.id, name: updated.name, plan: updated.plan, billingProvider: updated.billingProvider });
    },
  );
}
