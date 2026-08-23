import type { Plan } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Cloud usage limits.
 *
 * Metering answers "what is this account allowed to do", which is a different
 * question from analytics' "what happened". Limits apply only to Cloud
 * resources - the local proxy, dashboard, CLI and MCP server are never
 * metered, because nothing about them reaches this server.
 *
 * Existing billing stays the source of truth: the plan comes from Team.plan,
 * which only a verified payment webhook or a platform admin can change.
 */

export type LimitKey = "projects" | "endpoints" | "captures" | "ciChecks" | "teamMembers" | "integrations";

export interface PlanLimits {
  /** Cloud projects per team. */
  projects: number;
  /** Monitored endpoints per project. */
  endpoints: number;
  /** Schema captures per team per calendar month. */
  captures: number;
  /** Cloud CI checks per team per calendar month. */
  ciChecks: number;
  teamMembers: number;
  integrations: number;
  /** Days of history retained. Enforced by reads, not by deletion. */
  historyDays: number;
}

/**
 * Deliberately generous on the free tier: the goal is that a solo developer
 * evaluating Schema-Watch never hits a wall, while a team using it seriously
 * does. `Infinity` means genuinely unmetered.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    projects: 1,
    endpoints: 25,
    captures: 5_000,
    ciChecks: 100,
    teamMembers: 1,
    integrations: 0,
    historyDays: 7,
  },
  PRO: {
    projects: 20,
    endpoints: 250,
    captures: 100_000,
    ciChecks: 2_000,
    teamMembers: 1,
    integrations: 10,
    historyDays: 365,
  },
  TEAM: {
    projects: Infinity,
    endpoints: Infinity,
    captures: Infinity,
    ciChecks: Infinity,
    teamMembers: Infinity,
    integrations: Infinity,
    historyDays: Infinity,
  },
};

/** Warn before blocking, so a limit is never a surprise. */
export const WARNING_THRESHOLD = 0.8;

/** Monthly counters reset on the first of the month, which is also when a
 * subscription period naturally rolls. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export interface UsageEntry {
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
  warning: boolean;
  exceeded: boolean;
}

export type TeamUsage = Record<LimitKey, UsageEntry> & { plan: Plan; resetsAt: string };

function entry(used: number, limit: number): UsageEntry {
  const ratio = limit === Infinity ? 0 : used / limit;
  return {
    used,
    limit: limit === Infinity ? -1 : limit,
    remaining: limit === Infinity ? -1 : Math.max(0, limit - used),
    ratio,
    warning: ratio >= WARNING_THRESHOLD && ratio < 1,
    exceeded: used >= limit,
  };
}

/**
 * One round-trip for every counter. The dashboard and the enforcement path
 * both use this, and the database is remote, so issuing six separate counts
 * would cost six times the latency for no benefit.
 */
export async function teamUsage(teamId: string): Promise<TeamUsage> {
  const periodStart = currentPeriodStart();

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { plan: true } });
  const plan: Plan = team?.plan ?? "FREE";
  const limits = PLAN_LIMITS[plan];

  const rows = await prisma.$queryRaw<
    {
      projects: bigint;
      endpoints: bigint;
      captures: bigint;
      ci_checks: bigint;
      members: bigint;
      integrations: bigint;
    }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM "Project" WHERE "teamId" = ${teamId})::bigint AS projects,
      (SELECT COALESCE(MAX(c), 0) FROM (
        SELECT COUNT(*) AS c FROM "Endpoint" e
        JOIN "Project" p ON p.id = e."projectId"
        WHERE p."teamId" = ${teamId} GROUP BY e."projectId"
      ) per_project)::bigint AS endpoints,
      (SELECT COUNT(*) FROM "SchemaSnapshot" s
        JOIN "Endpoint" e ON e.id = s."endpointId"
        JOIN "Project" p ON p.id = e."projectId"
        WHERE p."teamId" = ${teamId} AND s."createdAt" >= ${periodStart})::bigint AS captures,
      (SELECT COUNT(*) FROM "AnalyticsEvent" a
        JOIN "Project" p ON p.id = a."projectId"
        WHERE p."teamId" = ${teamId} AND a."eventName" = 'ci_check_run'
          AND a."occurredAt" >= ${periodStart})::bigint AS ci_checks,
      (SELECT COUNT(*) FROM "TeamMember" WHERE "teamId" = ${teamId})::bigint AS members,
      (SELECT COUNT(*) FROM "Integration" i
        JOIN "Project" p ON p.id = i."projectId"
        WHERE p."teamId" = ${teamId})::bigint AS integrations
  `;

  const r = rows[0]!;
  return {
    plan,
    resetsAt: nextPeriodStart().toISOString(),
    projects: entry(Number(r.projects), limits.projects),
    // The endpoint cap is per project, so the busiest project is what counts.
    endpoints: entry(Number(r.endpoints), limits.endpoints),
    captures: entry(Number(r.captures), limits.captures),
    ciChecks: entry(Number(r.ci_checks), limits.ciChecks),
    teamMembers: entry(Number(r.members), limits.teamMembers),
    integrations: entry(Number(r.integrations), limits.integrations),
  };
}

export interface LimitVerdict {
  allowed: boolean;
  usage: UsageEntry;
  plan: Plan;
  resetsAt: string;
}

/** Server-side check. Never call this from the browser and trust the answer. */
export async function checkLimit(teamId: string, key: LimitKey): Promise<LimitVerdict> {
  const usage = await teamUsage(teamId);
  return { allowed: !usage[key].exceeded, usage: usage[key], plan: usage.plan, resetsAt: usage.resetsAt };
}

/** A machine-readable refusal, so a CLI or CI job can explain itself. */
export function limitError(key: LimitKey, verdict: LimitVerdict) {
  return {
    error: `You have reached your ${key} limit on the ${verdict.plan} plan.`,
    code: "USAGE_LIMIT_REACHED" as const,
    limit: {
      resource: key,
      used: verdict.usage.used,
      limit: verdict.usage.limit,
      plan: verdict.plan,
      resetsAt: verdict.resetsAt,
    },
  };
}
