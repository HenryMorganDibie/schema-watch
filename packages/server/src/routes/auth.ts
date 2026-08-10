import type { FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../plugins/authenticate.js";

interface AuthBody {
  email: string;
  password: string;
  name?: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AuthBody }>("/signup", async (req, reply) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password || password.length < 8) {
      return reply.code(400).send({ error: "email and a password of at least 8 characters are required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "an account with this email already exists" });

    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), name },
    });

    return reply.code(201).send({ token: signToken({ userId: user.id }), user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post<{ Body: AuthBody }>("/login", async (req, reply) => {
    const { email, password } = req.body ?? {};
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !(await verifyPassword(password ?? "", user.passwordHash))) {
      return reply.code(401).send({ error: "invalid email or password" });
    }
    return reply.send({ token: signToken({ userId: user.id }), user: { id: user.id, email: user.email, name: user.name } });
  });

  app.get("/me", { preHandler: requireUser }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { memberships: { include: { team: true } } },
    });
    if (!user) return reply.code(404).send({ error: "not found" });

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      teams: user.memberships.map((m) => ({ id: m.team.id, name: m.team.name, slug: m.team.slug, plan: m.team.plan, role: m.role })),
    });
  });
}
