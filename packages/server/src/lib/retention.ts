import { prisma } from "./prisma.js";

/**
 * Signup cohorts by week, and whether those users came back and did something.
 *
 * Two decisions carry this file.
 *
 * First, what counts as coming back. A login does not: someone can sign in,
 * see nothing worth doing and leave, and counting that as retention would
 * flatter the product exactly where it needs an honest reading. Activity here
 * means the agent connected, a CI check ran, or a schema was captured in one
 * of their team's projects. Those are all records of the product being used.
 *
 * Second, cells that have not happened yet. If someone signed up three days
 * ago, their week-1 window is still in the future. Rendering that as 0% would
 * invent a failure that has not occurred. Every cell is counted only over the
 * users whose window has fully elapsed, and a cell with nobody eligible is
 * null rather than zero.
 */

/** Week offsets from signup. Week 0 is the signup week itself. */
export const RETENTION_WEEKS = [0, 1, 2, 4, 8] as const;
export type RetentionWeek = (typeof RETENTION_WEEKS)[number];

export interface RetentionCell {
  week: RetentionWeek;
  /** Users whose week-N window has fully elapsed. Null cells have none. */
  eligible: number;
  active: number | null;
  /** 0..1, or null when nothing is measurable yet. */
  rate: number | null;
}

export interface RetentionCohort {
  /** ISO date of the Monday that starts the cohort week. */
  cohortWeek: string;
  size: number;
  cells: RetentionCell[];
}

export interface RetentionSummary {
  cohorts: RetentionCohort[];
  weeks: readonly RetentionWeek[];
  /** Total users across all cohorts shown. */
  totalUsers: number;
}

interface Row {
  cohort_week: Date;
  week_offset: number;
  cohort_size: bigint;
  eligible: bigint;
  active: bigint;
}

/**
 * One statement, for the same reason the summary is batched: the database is
 * remote and the cost is latency per round-trip, not the work itself.
 */
export async function retentionCohorts(weeksBack = 12): Promise<RetentionSummary> {
  const rows = await prisma.$queryRaw<Row[]>`
    WITH cohort AS (
      SELECT
        u.id AS user_id,
        u."createdAt" AS signed_up,
        date_trunc('week', u."createdAt") AS cohort_week
      FROM "User" u
      WHERE u."createdAt" >= date_trunc('week', now()) - make_interval(weeks => ${weeksBack}::int)
    ),
    -- Product usage, not presence. Snapshots are attributed through team
    -- membership because that is the only link a capture has to a person.
    activity AS (
      SELECT "userId" AS user_id, "occurredAt" AS at
      FROM "AnalyticsEvent"
      WHERE "userId" IS NOT NULL
        AND "eventName" IN ('agent_connected', 'ci_check_run')
      UNION ALL
      SELECT tm."userId" AS user_id, s."createdAt" AS at
      FROM "SchemaSnapshot" s
      JOIN "Endpoint" e ON e.id = s."endpointId"
      JOIN "Project" p ON p.id = e."projectId"
      JOIN "TeamMember" tm ON tm."teamId" = p."teamId"
    ),
    weeks AS (SELECT unnest(ARRAY[0, 1, 2, 4, 8]) AS week_offset),
    cells AS (
      SELECT
        c.cohort_week,
        w.week_offset,
        c.user_id,
        -- The window is [signup + N weeks, signup + N+1 weeks).
        c.signed_up + make_interval(weeks => w.week_offset) AS window_start,
        c.signed_up + make_interval(weeks => w.week_offset + 1) AS window_end
      FROM cohort c
      CROSS JOIN weeks w
    )
    SELECT
      cl.cohort_week,
      cl.week_offset,
      COUNT(DISTINCT cl.user_id)::bigint AS cohort_size,
      COUNT(DISTINCT cl.user_id) FILTER (WHERE cl.window_end <= now())::bigint AS eligible,
      COUNT(DISTINCT cl.user_id) FILTER (
        WHERE cl.window_end <= now()
          AND EXISTS (
            SELECT 1 FROM activity a
            WHERE a.user_id = cl.user_id
              AND a.at >= cl.window_start
              AND a.at <  cl.window_end
          )
      )::bigint AS active
    FROM cells cl
    GROUP BY cl.cohort_week, cl.week_offset
    ORDER BY cl.cohort_week DESC, cl.week_offset ASC
  `;

  const byWeek = new Map<string, RetentionCohort>();
  for (const r of rows) {
    const key = new Date(r.cohort_week).toISOString().slice(0, 10);
    let cohort = byWeek.get(key);
    if (!cohort) {
      cohort = { cohortWeek: key, size: Number(r.cohort_size), cells: [] };
      byWeek.set(key, cohort);
    }
    const eligible = Number(r.eligible);
    const active = Number(r.active);
    cohort.cells.push({
      week: r.week_offset as RetentionWeek,
      eligible,
      // Nobody's window has closed yet, so there is nothing to report.
      active: eligible === 0 ? null : active,
      rate: eligible === 0 ? null : active / eligible,
    });
  }

  const cohorts = [...byWeek.values()];
  return {
    cohorts,
    weeks: RETENTION_WEEKS,
    totalUsers: cohorts.reduce((sum, c) => sum + c.size, 0),
  };
}
