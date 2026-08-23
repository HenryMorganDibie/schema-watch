import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Events recorded in AnalyticsEvent.
 *
 * Anything already implied by another table is NOT here: signups are counted
 * from User, projects from Project, captures from SchemaSnapshot, breaking
 * changes from ContractChange. Duplicating those would mean two sources of
 * truth that drift.
 */
export const ANALYTICS_EVENTS = [
  // Anonymous website engagement, the only thing the database cannot infer.
  "page_view",
  "try_cloud_clicked",
  "signup_started",
  "email_verification_started",
  // Server-side actions that leave no row of their own.
  "email_verification_completed",
  "login",
  "agent_connected",
  "ci_check_run",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Events a browser may submit. The rest are server-side only, so a visitor
 * cannot forge a login or inflate CI usage. */
export const CLIENT_EVENTS: readonly string[] = [
  "page_view",
  "try_cloud_clicked",
  "signup_started",
  "email_verification_started",
];

export interface RecordEventInput {
  eventName: AnalyticsEventName;
  anonymousVisitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  route?: string | null;
  referrerHost?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Keeps identifiers bounded so a malformed or hostile client cannot write
 * arbitrarily large rows. */
function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Only the referrer's host is kept. A full referrer URL can carry paths,
 * query strings and tokens, none of which are needed to answer "did anyone
 * arrive from LinkedIn".
 */
export function referrerHostOf(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.slice(0, 120) || null;
  } catch {
    return null;
  }
}

/**
 * Never throws and never blocks the caller's real work. Analytics failing is
 * always less important than the request that triggered it.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventName: input.eventName,
        anonymousVisitorId: clamp(input.anonymousVisitorId, 64),
        sessionId: clamp(input.sessionId, 64),
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        route: clamp(input.route, 200),
        referrerHost: clamp(input.referrerHost, 120),
        metadata: input.metadata,
      },
    });
  } catch (err) {
    console.warn(`[analytics] could not record ${input.eventName}:`, (err as Error).message);
  }
}

/** Fire-and-forget, for request handlers that should not wait on telemetry. */
export function recordEventAsync(input: RecordEventInput): void {
  void recordEvent(input);
}
