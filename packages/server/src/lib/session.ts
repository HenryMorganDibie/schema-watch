import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

/**
 * Interactive sessions.
 *
 * Access tokens are short-lived and stateless; refresh tokens are long-lived,
 * stored only as a hash, rotated on every use, and revocable. That split is
 * what turns "logout" from a client-side gesture into something the server
 * can actually enforce.
 *
 * Machine credentials (ApiKey) deliberately do not go through here: a CI job
 * and a browser tab must not share a credential model.
 */

/** Long enough that expiry is not a daily annoyance, short enough that an
 * abandoned session does not live forever. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashRefreshToken(plainText: string): string {
  return createHash("sha256").update(plainText).digest("hex");
}

/**
 * A coarse client label for the sessions list. Deliberately not the raw user
 * agent and never an IP: enough to recognise "my other laptop", not enough to
 * fingerprint.
 */
export function userAgentLabel(req: FastifyRequest): string | null {
  const ua = req.headers["user-agent"];
  if (typeof ua !== "string" || !ua) return null;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";

  return os ? `${browser} on ${os}` : browser;
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function createSession(userId: string, label: string | null): Promise<IssuedSession> {
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const session = await prisma.session.create({
    data: { userId, refreshTokenHash: hashRefreshToken(refreshToken), expiresAt, userAgentLabel: label },
  });

  return { sessionId: session.id, refreshToken, expiresAt };
}

export type RotateResult =
  | { ok: true; userId: string; session: IssuedSession }
  | { ok: false; reason: "unknown" | "expired" | "revoked" | "reused" };

/**
 * Exchanges a refresh token for a new one.
 *
 * Presenting a token that has already been rotated means two parties hold it,
 * so the token leaked. In that case the entire session chain is revoked
 * rather than just refusing the request: refusing alone would leave the
 * thief's newer token working.
 */
export async function rotateSession(refreshToken: string, label: string | null): Promise<RotateResult> {
  const existing = await prisma.session.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
  });

  if (!existing) return { ok: false, reason: "unknown" };

  if (existing.rotatedToId) {
    await revokeSessionChain(existing.id, "refresh token reuse detected");
    return { ok: false, reason: "reused" };
  }
  if (existing.revokedAt) return { ok: false, reason: "revoked" };
  if (existing.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const next = await createSession(existing.userId, label ?? existing.userAgentLabel);

  await prisma.session.update({
    where: { id: existing.id },
    data: { rotatedToId: next.sessionId, lastUsedAt: new Date() },
  });

  return { ok: true, userId: existing.userId, session: next };
}

/**
 * Revokes a session and everything it rotated into. A leaked token is only
 * neutralised if its successors die with it.
 */
export async function revokeSessionChain(sessionId: string, reason: string): Promise<void> {
  const seen = new Set<string>();
  let current: string | null = sessionId;

  while (current && !seen.has(current)) {
    seen.add(current);
    const session: { rotatedToId: string | null } | null = await prisma.session.update({
      where: { id: current },
      data: { revokedAt: new Date(), revokedReason: reason },
      select: { rotatedToId: true },
    });
    current = session?.rotatedToId ?? null;
  }
}

export async function revokeByRefreshToken(refreshToken: string, reason: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: { id: true },
  });
  if (!session) return false;

  await revokeSessionChain(session.id, reason);
  return true;
}

/** Used when a password reset or other account-security event should end
 * every signed-in session. */
export async function revokeAllSessions(userId: string, reason: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function listSessions(userId: string) {
  return prisma.session.findMany({
    // A rotated session is a spent link in a chain, not a separate device.
    where: { userId, revokedAt: null, rotatedToId: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, userAgentLabel: true, lastUsedAt: true, createdAt: true, expiresAt: true },
  });
}
