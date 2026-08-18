import type { FastifyReply, FastifyRequest } from "fastify";
import { hashApiKey } from "../lib/apiKey.js";
import { verifyToken } from "../lib/jwt.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    teamId?: string;
  }
}

/**
 * Interactive routes: browser calls with `Authorization: Bearer <jwt>`.
 *
 * Verifying the signature is not enough. The token's version is checked
 * against the stored one so a password reset can revoke sessions that were
 * issued before it - otherwise a stolen token outlives the reset meant to
 * stop it. That costs one primary-key lookup per authenticated request.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing bearer token" });
  }

  let payload;
  try {
    payload = verifyToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  });
  if (!user) {
    return reply.code(401).send({ error: "invalid or expired token" });
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    return reply.code(401).send({ error: "session ended, please sign in again", code: "SESSION_REVOKED" });
  }

  req.userId = payload.userId;
}

/**
 * Guards actions that let an account reach outside itself - minting API keys,
 * starting a subscription. Browsing is deliberately left open so a new user
 * can look around before confirming their address; this only blocks the
 * things worth abusing. Run it after requireUser.
 */
export async function requireVerifiedEmail(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) {
    return reply.code(403).send({ error: "verify your email address first", code: "EMAIL_NOT_VERIFIED" });
  }
}

/**
 * Guards the operator-only admin surface. Run after requireUser.
 *
 * Returns 404 rather than 403 for non-admins, so the existence of the admin
 * routes is not advertised to anyone probing the API.
 */
export async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, emailVerified: true },
  });

  // Verification is required as well as membership. Listing an address in
  // PLATFORM_ADMIN_EMAILS before an account exists for it would otherwise let
  // whoever registers that address first become an operator, since signup
  // hands back a working session immediately. Requiring a confirmed inbox
  // means claiming the address is not enough.
  if (!user?.emailVerified || !isPlatformAdmin(user.email)) {
    return reply.code(404).send({ error: "not found" });
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
