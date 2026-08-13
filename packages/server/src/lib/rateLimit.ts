import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export interface RateLimitRule {
  /** Distinguishes one limit from another, e.g. "login". */
  name: string;
  limit: number;
  windowMs: number;
}

/**
 * The client address behind Vercel's proxy. `req.ip` is the proxy itself
 * unless trustProxy is configured, so read the forwarded header directly and
 * take the first entry, which is the original client.
 */
export function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in Postgres.
 *
 * Fixed rather than sliding because it is one indexed upsert per call, which
 * matters on an endpoint that is already doing a bcrypt comparison. The known
 * cost is burstiness at a window boundary: up to 2x the limit can pass across
 * two adjacent windows. That is an acceptable trade for brute-force
 * protection, where the goal is to make thousands of attempts impossible
 * rather than to police the exact tenth.
 */
export async function consumeRateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowEnd = new Date(Math.ceil(now / rule.windowMs) * rule.windowMs);
  const bucket = `${rule.name}:${identifier}`;

  try {
    const record = await prisma.rateLimit.upsert({
      where: { bucket_windowEnd: { bucket, windowEnd } },
      create: { bucket, windowEnd, count: 1 },
      update: { count: { increment: 1 } },
    });

    // Opportunistic cleanup: cheap, and avoids needing a scheduled job for a
    // table that would otherwise grow forever.
    if (Math.random() < 0.01) {
      prisma.rateLimit.deleteMany({ where: { windowEnd: { lt: new Date(now) } } }).catch(() => {});
    }

    return {
      allowed: record.count <= rule.limit,
      remaining: Math.max(0, rule.limit - record.count),
      retryAfterSeconds: Math.max(1, Math.ceil((windowEnd.getTime() - now) / 1000)),
    };
  } catch {
    // Fail open. A database hiccup should not make signing in impossible;
    // losing rate limiting for that moment is the lesser failure.
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/**
 * Enforces a rule and writes the 429 itself. Returns true when the caller
 * should stop, so route handlers read as:
 *
 *   if (await enforceRateLimit(req, reply, RULE, key)) return;
 */
export async function enforceRateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  rule: RateLimitRule,
  identifier: string,
): Promise<boolean> {
  const result = await consumeRateLimit(rule, identifier);

  reply.header("x-ratelimit-limit", rule.limit);
  reply.header("x-ratelimit-remaining", result.remaining);

  if (!result.allowed) {
    req.log.warn({ rule: rule.name, identifier }, "rate limit exceeded");
    reply.header("retry-after", result.retryAfterSeconds);
    await reply.code(429).send({
      error: "Too many attempts. Please wait and try again.",
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return true;
  }

  return false;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Limits are per rule and per identifier. Login is limited by address *and*
 * by account, so one attacker cannot lock every user out by hammering a
 * single IP, and a botnet cannot spread an attack on one account across many
 * addresses.
 */
export const RATE_LIMITS = {
  loginByIp: { name: "login-ip", limit: 20, windowMs: 15 * MINUTE },
  loginByEmail: { name: "login-email", limit: 8, windowMs: 15 * MINUTE },
  signupByIp: { name: "signup-ip", limit: 5, windowMs: HOUR },
  forgotByEmail: { name: "forgot-email", limit: 3, windowMs: HOUR },
  forgotByIp: { name: "forgot-ip", limit: 10, windowMs: HOUR },
  resetByIp: { name: "reset-ip", limit: 10, windowMs: HOUR },
  resendByUser: { name: "resend-user", limit: 3, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;
