import type { FastifyInstance } from "fastify";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { checkPassword } from "../lib/passwordPolicy.js";
import { signAccessToken } from "../lib/jwt.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { recordEventAsync } from "../lib/analytics.js";
import { prisma } from "../lib/prisma.js";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "../lib/rateLimit.js";
import { consumeToken, issueToken } from "../lib/tokens.js";
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeByRefreshToken,
  revokeSessionChain,
  rotateSession,
  userAgentLabel,
} from "../lib/session.js";
import { requireUser } from "../plugins/authenticate.js";

interface AuthBody {
  email: string;
  password: string;
  name?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AuthBody }>("/signup", async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.signupByIp, clientIp(req))) return;

    const { email, password, name } = req.body ?? {};
    if (!email || !password) return reply.code(400).send({ error: "email and password are required" });

    const normalized = normalizeEmail(email);
    const strength = checkPassword(password, normalized);
    if (!strength.ok) return reply.code(400).send({ error: strength.reason });

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) return reply.code(409).send({ error: "an account with this email already exists" });

    const user = await prisma.user.create({
      data: { email: normalized, passwordHash: await hashPassword(password), name },
    });

    // The account exists whether or not the mail provider is reachable, so a
    // provider outage must not turn a successful signup into a 500. The user
    // can always request another link from inside the app.
    try {
      await sendVerificationEmail(user.email, await issueToken(user.id, "EMAIL_VERIFY"));
    } catch (err) {
      req.log.error({ err }, "failed to send verification email");
    }

    const session = await createSession(user.id, userAgentLabel(req));
    return reply.code(201).send({
      token: signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion, sessionId: session.sessionId }),
      refreshToken: session.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    });
  });

  app.post<{ Body: AuthBody }>("/login", async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (await enforceRateLimit(req, reply, RATE_LIMITS.loginByIp, clientIp(req))) return;
    // Also per account, so an attacker spreading attempts across addresses
    // still cannot grind a single password, and one noisy IP cannot lock
    // every other user out.
    if (email && (await enforceRateLimit(req, reply, RATE_LIMITS.loginByEmail, normalizeEmail(email)))) return;

    const user = email ? await prisma.user.findUnique({ where: { email: normalizeEmail(email) } }) : null;
    if (!user || !(await verifyPassword(password ?? "", user.passwordHash))) {
      return reply.code(401).send({ error: "invalid email or password" });
    }
    recordEventAsync({ eventName: "login", userId: user.id });
    const session = await createSession(user.id, userAgentLabel(req));
    return reply.send({
      token: signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion, sessionId: session.sessionId }),
      refreshToken: session.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    });
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
      emailVerified: user.emailVerified,
      isPlatformAdmin: user.emailVerified && isPlatformAdmin(user.email),
      teams: user.memberships.map((m) => ({
        id: m.team.id,
        name: m.team.name,
        slug: m.team.slug,
        plan: m.team.plan,
        role: m.role,
      })),
    });
  });

  app.post<{ Body: { token: string } }>("/verify-email", async (req, reply) => {
    const { token } = req.body ?? {};
    if (!token) return reply.code(400).send({ error: "token is required" });

    const consumed = await consumeToken(token, "EMAIL_VERIFY");
    if (!consumed) return reply.code(400).send({ error: "this link is invalid or has expired" });

    await prisma.user.update({ where: { id: consumed.userId }, data: { emailVerified: true } });
    recordEventAsync({ eventName: "email_verification_completed", userId: consumed.userId });
    return reply.send({ verified: true });
  });

  app.post("/verify-email/resend", { preHandler: requireUser }, async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.resendByUser, req.userId!)) return;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return reply.code(404).send({ error: "not found" });
    if (user.emailVerified) return reply.send({ alreadyVerified: true });

    try {
      await sendVerificationEmail(user.email, await issueToken(user.id, "EMAIL_VERIFY"));
    } catch (err) {
      req.log.error({ err }, "failed to resend verification email");
      return reply.code(502).send({ error: "could not send the email just now, please try again" });
    }
    return reply.send({ sent: true });
  });

  /**
   * Always reports success, even when no such account exists. Returning 404
   * here would turn this endpoint into a way to test which email addresses
   * are registered.
   */
  app.post<{ Body: { email: string } }>("/forgot-password", async (req, reply) => {
    const { email } = req.body ?? {};
    if (!email) return reply.code(400).send({ error: "email is required" });
    if (await enforceRateLimit(req, reply, RATE_LIMITS.forgotByIp, clientIp(req))) return;
    if (await enforceRateLimit(req, reply, RATE_LIMITS.forgotByEmail, normalizeEmail(email))) return;

    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (user) {
      try {
        await sendPasswordResetEmail(user.email, await issueToken(user.id, "PASSWORD_RESET"));
      } catch (err) {
        req.log.error({ err }, "failed to send password reset email");
      }
    }

    return reply.send({ sent: true });
  });

  app.post<{ Body: { token: string; password: string } }>("/reset-password", async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.resetByIp, clientIp(req))) return;

    const { token, password } = req.body ?? {};
    if (!token || !password) return reply.code(400).send({ error: "token and password are required" });

    const strength = checkPassword(password);
    if (!strength.ok) return reply.code(400).send({ error: strength.reason });

    const consumed = await consumeToken(token, "PASSWORD_RESET");
    if (!consumed) return reply.code(400).send({ error: "this link is invalid or has expired" });

    // Completing a reset proves control of the inbox, so treat the address as
    // verified too - otherwise a user who never clicked the original link
    // would still be stuck behind the unverified gate.
    // Bumping tokenVersion invalidates every JWT issued before this reset, so
    // an attacker holding a stolen token loses access the moment the real
    // owner recovers the account. The response carries a freshly versioned
    // token so the person doing the reset stays signed in.
    const user = await prisma.user.update({
      where: { id: consumed.userId },
      data: {
        passwordHash: await hashPassword(password),
        emailVerified: true,
        tokenVersion: { increment: 1 },
      },
    });

    // tokenVersion alone invalidates issued access tokens; the session rows
    // must go too, or a stolen refresh token could mint brand new ones.
    await revokeAllSessions(user.id, "password reset");
    recordEventAsync({ eventName: "password_reset_completed", userId: user.id });

    const session = await createSession(user.id, userAgentLabel(req));
    return reply.send({
      token: signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion, sessionId: session.sessionId }),
      refreshToken: session.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    });
  });

  /**
   * Exchanges a refresh token for a new access token and a new refresh token.
   * Rotation is unconditional: the presented token is always spent.
   */
  app.post<{ Body: { refreshToken: string } }>("/refresh", async (req, reply) => {
    if (await enforceRateLimit(req, reply, RATE_LIMITS.refreshByIp, clientIp(req))) return;

    const { refreshToken } = req.body ?? {};
    if (!refreshToken) return reply.code(400).send({ error: "refreshToken is required" });

    const result = await rotateSession(refreshToken, userAgentLabel(req));
    if (!result.ok) {
      // Reuse means the token leaked and the chain has just been revoked, so
      // both the victim and the thief are signed out and must reauthenticate.
      const code = result.reason === "reused" ? "REFRESH_TOKEN_REUSED" : "SESSION_REVOKED";
      return reply.code(401).send({ error: "please sign in again", code });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, email: true, name: true, emailVerified: true, tokenVersion: true },
    });
    if (!user) return reply.code(401).send({ error: "please sign in again", code: "SESSION_REVOKED" });

    return reply.send({
      token: signAccessToken({
        userId: user.id,
        tokenVersion: user.tokenVersion,
        sessionId: result.session.sessionId,
      }),
      refreshToken: result.session.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    });
  });

  /**
   * Ends the current session server-side. Accepts the refresh token so the
   * whole chain dies; falls back to the access token's session when the
   * client no longer holds one.
   */
  app.post<{ Body: { refreshToken?: string } }>("/logout", async (req, reply) => {
    const { refreshToken } = req.body ?? {};

    if (refreshToken) {
      await revokeByRefreshToken(refreshToken, "logout");
    } else {
      // No refresh token: fall back to the session named by a valid access
      // token, if one was sent.
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("../lib/jwt.js");
          const payload = verifyToken(header.slice("Bearer ".length));
          if (payload.sessionId) await revokeSessionChain(payload.sessionId, "logout");
        } catch {
          // An unusable token means there is nothing to revoke.
        }
      }
    }

    // Always 204: telling a caller whether a token was real would leak.
    return reply.code(204).send();
  });

  app.get("/sessions", { preHandler: requireUser }, async (req, reply) => {
    const sessions = await listSessions(req.userId!);
    return reply.send(
      sessions.map((s) => ({ ...s, current: s.id === req.sessionId })),
    );
  });

  /** Signs every device out, including this one. */
  app.post("/sessions/revoke-all", { preHandler: requireUser }, async (req, reply) => {
    const count = await revokeAllSessions(req.userId!, "signed out everywhere");
    recordEventAsync({ eventName: "session_revoked", userId: req.userId! });
    return reply.send({ revoked: count });
  });
}
