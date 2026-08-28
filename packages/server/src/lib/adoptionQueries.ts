import { prisma } from "./prisma.js";

/**
 * The adoption funnel, stated as five separate things rather than one
 * flattering number.
 *
 * The temptation with a published package is to read the npm download count as
 * an audience. It is not one. npm counts installs, and CI runners, mirrors,
 * Docker layers and registry caches all install. These metrics exist so that
 * each row means exactly one thing and none of them can be mistaken for
 * "developers using this".
 *
 * Telemetry is opt-in, so every installation figure here is a FLOOR, not a
 * total. Most people who run the tool will never appear. That is the correct
 * trade, and the dashboard says so rather than quietly implying coverage.
 */

const DAY = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 30;

export interface AdoptionMetric {
  key: string;
  label: string;
  value: number | null;
  meaning: string;
  /** Who produced the number, so first-party and third-party never blur. */
  source: "npm" | "telemetry" | "database";
}

export interface AdoptionSummary {
  metrics: AdoptionMetric[];
  byEnvironment: { environment: string; installations: number; events: number }[];
  recentEvents: { event: string; environment: string; count: number }[];
  telemetryIsOptIn: true;
  activeWindowDays: number;
}

export async function adoptionSummary(npmLastMonth: number | null): Promise<AdoptionSummary> {
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * DAY);

  const [reporting, active, linkedTeams, cloudUsers] = [
    await prisma.telemetryInstallation.count(),
    await prisma.telemetryInstallation.count({ where: { lastSeenAt: { gte: activeSince } } }),
    await prisma.telemetryInstallation.findMany({
      where: { teamId: { not: null } },
      select: { teamId: true },
      distinct: ["teamId"],
    }),
    await prisma.user.count(),
  ];

  const envRows = await prisma.telemetryInstallation.groupBy({
    by: ["environment"],
    _count: { _all: true },
  });
  const envEvents = await prisma.telemetryEvent.groupBy({
    by: ["environment"],
    _count: { _all: true },
  });
  const eventRows = await prisma.telemetryEvent.groupBy({
    by: ["event", "environment"],
    _count: { _all: true },
    where: { occurredAt: { gte: activeSince } },
  });

  return {
    metrics: [
      {
        key: "npmDownloads",
        label: "npm downloads",
        value: npmLastMonth,
        meaning: "Package download events in the last 30 days. Includes CI, mirrors and caches. Not people.",
        source: "npm",
      },
      {
        key: "reportingInstallations",
        label: "Reporting installations",
        value: reporting,
        meaning: "Unique machines that opted into telemetry. A machine, not a person. A floor, not a total.",
        source: "telemetry",
      },
      {
        key: "activeInstallations",
        label: "Active installations",
        value: active,
        meaning: `Reporting installations that ran a command in the last ${ACTIVE_WINDOW_DAYS} days.`,
        source: "telemetry",
      },
      {
        key: "linkedDevelopers",
        label: "Linked developers",
        value: linkedTeams.length,
        meaning: "Cloud accounts with at least one linked installation, so a laptop and its CI runner count once.",
        source: "telemetry",
      },
      {
        key: "cloudUsers",
        label: "Cloud users",
        value: cloudUsers,
        meaning: "Registered Cloud accounts. The only identifiable people in this table.",
        source: "database",
      },
    ],
    byEnvironment: envRows.map((row) => ({
      environment: row.environment,
      installations: row._count._all,
      events: envEvents.find((e) => e.environment === row.environment)?._count._all ?? 0,
    })),
    recentEvents: eventRows
      .map((row) => ({ event: row.event, environment: row.environment, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    telemetryIsOptIn: true,
    activeWindowDays: ACTIVE_WINDOW_DAYS,
  };
}
