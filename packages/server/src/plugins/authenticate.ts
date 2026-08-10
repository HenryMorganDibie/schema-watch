import type { FastifyReply, FastifyRequest } from "fastify";
import { hashApiKey } from "../lib/apiKey.js";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    teamId?: string;
  }
}

/** Interactive routes: browser calls with `Authorization: Bearer <jwt>`. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing bearer token" });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.userId = payload.userId;
  } catch {
    return reply.code(401).send({ error: "invalid or expired token" });
  }
}

/** Machine routes (CI, the agent's sync mode): `X-Api-Key: sw_live_...`, scoped to one team. */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || !key) {
    return reply.code(401).send({ error: "missing X-Api-Key header" });
  }
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
  if (!record) {
    return reply.code(401).send({ error: "invalid API key" });
  }
  req.teamId = record.teamId;
  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
}
