import type { FastifyInstance } from "fastify";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { checkPassword } from "../lib/passwordPolicy.js";
import { signToken } from "../lib/jwt.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { prisma } from "../lib/prisma.js";
import { RATE_LIMITS, clientIp, enforceRateLimit } from "../lib/rateLimit.js";
import { consumeToken, issueToken } from "../lib/tokens.js";
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

    return reply.code(201).send({
      token: signToken({ userId: user.id, tokenVersion: user.tokenVersion }),
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
    return reply.send({
      token: signToken({ userId: user.id, tokenVersion: user.tokenVersion }),
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

    return reply.send({
      token: signToken({ userId: user.id, tokenVersion: user.tokenVersion }),
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    });
  });
}
