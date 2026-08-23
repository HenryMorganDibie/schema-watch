import { prisma } from "./prisma.js";

export type RangeDays = 7 | 30 | 90;

export interface HeadlineMetrics {
  totalUsers: number;
  activeUsers: number;
  projects: number;
  activeProjects: number;
  schemasCaptured: number;
  breakingChanges: number;
  ciChecks: number;
  /** null means "cannot be measured", never zero-as-a-guess. */
  mcpUsage: number | null;
}

export interface DailyPoint {
  date: string;
  totalActivity: number;
  newUsers: number;
  newProjects: number;
  schemasCaptured: number;
  breakingChanges: number;
}

export interface FunnelStep {
  label: string;
  count: number;
}

export interface RecentActivityRow {
  id: string;
  occurredAt: Date;
  eventName: string;
  actor: string;
  projectName: string | null;
}

export interface AnalyticsSummary {
  metrics: HeadlineMetrics;
  series: DailyPoint[];
  funnel: FunnelStep[];
  recent: RecentActivityRow[];
}

const startOf = (days: RangeDays): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * The whole dashboard is three round-trips, not thirty.
 *
 * Each count is individually trivial - they are all indexed COUNTs - but the
 * database is remote, so the cost is dominated by latency per query, not by
 * the work. Issuing them one at a time took roughly twenty seconds, which
 * would eventually exceed the serverless function timeout.
 *
 * They cannot simply be run concurrently either: the pooled connection string
 * allows a single connection (pgbouncer, one per invocation), so Promise.all
 * queues them and the later ones time out. Batching into single statements is
 * what actually fixes it.
 */

interface MetricsRow {
  total_users: bigint;
  total_projects: bigint;
  schemas_captured: bigint;
  breaking_changes: bigint;
  ci_checks: bigint;
  active_users: bigint;
  active_projects: bigint;
  visitors: bigint;
  try_cloud: bigint;
  signup_started: bigint;
  signups_completed: bigint;
  projects_created: bigint;
}

/** Headline metrics and the funnel share most of their inputs, so they are
 * gathered in one statement of scalar subqueries. */
async function metricsAndFunnel(since: Date): Promise<MetricsRow> {
  const rows = await prisma.$queryRaw<MetricsRow[]>`
    SELECT
      (SELECT COUNT(*) FROM "User")::bigint AS total_users,
      (SELECT COUNT(*) FROM "Project")::bigint AS total_projects,
      (SELECT COUNT(*) FROM "SchemaSnapshot" WHERE "createdAt" >= ${since})::bigint AS schemas_captured,
      (SELECT COUNT(*) FROM "ContractChange"
        WHERE "createdAt" >= ${since} AND "severity" = 'BREAKING')::bigint AS breaking_changes,
      (SELECT COUNT(*) FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since} AND "eventName" = 'ci_check_run')::bigint AS ci_checks,
      (SELECT COUNT(DISTINCT "userId") FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since} AND "userId" IS NOT NULL)::bigint AS active_users,
      (SELECT COUNT(DISTINCT e."projectId") FROM "SchemaSnapshot" s
        JOIN "Endpoint" e ON e.id = s."endpointId"
        WHERE s."createdAt" >= ${since})::bigint AS active_projects,
      (SELECT COUNT(DISTINCT "anonymousVisitorId") FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since} AND "eventName" = 'page_view'
          AND "anonymousVisitorId" IS NOT NULL)::bigint AS visitors,
      (SELECT COUNT(DISTINCT "anonymousVisitorId") FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since} AND "eventName" = 'try_cloud_clicked'
          AND "anonymousVisitorId" IS NOT NULL)::bigint AS try_cloud,
      (SELECT COUNT(DISTINCT "anonymousVisitorId") FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since} AND "eventName" = 'signup_started'
          AND "anonymousVisitorId" IS NOT NULL)::bigint AS signup_started,
      (SELECT COUNT(*) FROM "User" WHERE "createdAt" >= ${since})::bigint AS signups_completed,
      (SELECT COUNT(*) FROM "Project" WHERE "createdAt" >= ${since})::bigint AS projects_created
  `;
  return rows[0]!;
}

interface SeriesRow {
  kind: string;
  day: Date;
  count: bigint;
}

/** All five daily series in one statement, grouped in Postgres so the payload
 * is one row per day per series regardless of volume. */
async function seriesRows(since: Date): Promise<SeriesRow[]> {
  return prisma.$queryRaw<SeriesRow[]>`
    SELECT 'users' AS kind, date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1, 2
    UNION ALL
    SELECT 'projects', date_trunc('day', "createdAt"), COUNT(*)::bigint
      FROM "Project" WHERE "createdAt" >= ${since} GROUP BY 1, 2
    UNION ALL
    SELECT 'snapshots', date_trunc('day', "createdAt"), COUNT(*)::bigint
      FROM "SchemaSnapshot" WHERE "createdAt" >= ${since} GROUP BY 1, 2
    UNION ALL
    SELECT 'breaking', date_trunc('day', "createdAt"), COUNT(*)::bigint
      FROM "ContractChange" WHERE "createdAt" >= ${since} AND "severity" = 'BREAKING' GROUP BY 1, 2
    UNION ALL
    SELECT 'events', date_trunc('day', "occurredAt"), COUNT(*)::bigint
      FROM "AnalyticsEvent" WHERE "occurredAt" >= ${since} GROUP BY 1, 2
  `;
}

interface RecentRow {
  id: string;
  occurredAt: Date;
  eventName: string;
  email: string | null;
  projectName: string | null;
  projectId: string | null;
  userId: string | null;
}

/** Joined server-side rather than fetched and stitched, saving two more
 * round-trips. */
async function recentRows(limit: number): Promise<RecentRow[]> {
  return prisma.$queryRaw<RecentRow[]>`
    SELECT a.id, a."occurredAt", a."eventName", u.email, p.name AS "projectName", a."projectId", a."userId"
      FROM "AnalyticsEvent" a
      LEFT JOIN "User" u ON u.id = a."userId"
      LEFT JOIN "Project" p ON p.id = a."projectId"
     ORDER BY a."occurredAt" DESC
     LIMIT ${limit}
  `;
}

export async function analyticsSummary(days: RangeDays, recentLimit = 25): Promise<AnalyticsSummary> {
  const since = startOf(days);

  const row = await metricsAndFunnel(since);
  const rows = await seriesRows(since);
  const recent = await recentRows(recentLimit);

  const bucket = (kind: string) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.kind === kind) map.set(r.day.toISOString().slice(0, 10), num(r.count));
    }
    return map;
  };
  const users = bucket("users");
  const projects = bucket("projects");
  const snapshots = bucket("snapshots");
  const breaking = bucket("breaking");
  const events = bucket("events");

  const series: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const newUsers = users.get(date) ?? 0;
    const newProjects = projects.get(date) ?? 0;
    const schemasCaptured = snapshots.get(date) ?? 0;
    const breakingChanges = breaking.get(date) ?? 0;

    series.push({
      date,
      newUsers,
      newProjects,
      schemasCaptured,
      breakingChanges,
      // Everything that happened, including anonymous website activity.
      totalActivity: (events.get(date) ?? 0) + newUsers + newProjects + schemasCaptured,
    });
  }

  return {
    series,
    metrics: {
      totalUsers: num(row.total_users),
      activeUsers: num(row.active_users),
      projects: num(row.total_projects),
      activeProjects: num(row.active_projects),
      schemasCaptured: num(row.schemas_captured),
      breakingChanges: num(row.breaking_changes),
      ciChecks: num(row.ci_checks),
      // The MCP server runs locally and makes no network calls, so its usage
      // never reaches this database. Reported as unmeasurable rather than 0,
      // which would read as "nobody used it".
      mcpUsage: null,
    },
    // Each step counts distinct actors, so one visitor refreshing ten times is
    // still one visitor.
    funnel: [
      { label: "Visitors", count: num(row.visitors) },
      { label: "Try Cloud clicks", count: num(row.try_cloud) },
      { label: "Signup started", count: num(row.signup_started) },
      { label: "Signup completed", count: num(row.signups_completed) },
      { label: "Project created", count: num(row.projects_created) },
      { label: "Schema captured", count: num(row.active_projects) },
    ],
    recent: recent.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      eventName: r.eventName,
      // A machine event carries a project but no user. An event whose user
      // has since been deleted still has a userId, and calling either an
      // "anonymous visitor" would wrongly imply a person was browsing.
      actor: r.email ?? (r.userId ? "Deleted user" : r.projectId ? "Agent / CI" : "Anonymous visitor"),
      projectName: r.projectName,
    })),
  };
}
