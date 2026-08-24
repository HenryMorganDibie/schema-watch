/**
 * npm download counts for the published CLI.
 *
 * This exists because the local tool is deliberately network-free: someone can
 * run `npx schema-watch`, get the whole product, and never touch anything we
 * can measure. Downloads are the only visibility into that step of the funnel,
 * and the step matters, because it sits between discovering the repo and
 * signing up for Cloud.
 *
 * Same caveat as the GitHub panel, for the same reason: npm counts installs,
 * not people. CI runs, Docker builds, registry mirrors and caches all pull the
 * package. It is a direction, not an audience.
 *
 * The endpoint is public and unauthenticated, so there is nothing to configure.
 */

const API = "https://api.npmjs.org/downloads/point";
const PACKAGE = "schema-watch";
const TIMEOUT_MS = 6000;

export interface NpmDownloads {
  available: boolean;
  reason: string | null;
  package: string;
  lastDay: number | null;
  lastWeek: number | null;
  lastMonth: number | null;
  fetchedAt: string;
}

async function point(range: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${range}/${PACKAGE}`, {
      headers: { "user-agent": "schema-watch-analytics" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`npm responded ${res.status}`);
    const body = (await res.json()) as { downloads?: number; error?: string };
    // npm answers 404 for a package it has no stats for yet, but guard the
    // 200-with-error shape too: defaulting that to 0 would report "no
    // downloads" when the truth is "not counted yet".
    if (body.error) throw new Error(body.error);
    if (typeof body.downloads !== "number") throw new Error("no download count in response");
    return body.downloads;
  } finally {
    clearTimeout(timer);
  }
}

let cache: { at: number; value: NpmDownloads } | null = null;
const CACHE_MS = 30 * 60 * 1000;

export async function npmDownloads(): Promise<NpmDownloads> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  try {
    const lastDay = await point("last-day");
    const lastWeek = await point("last-week");
    const lastMonth = await point("last-month");
    const value: NpmDownloads = {
      available: true,
      reason: null,
      package: PACKAGE,
      lastDay,
      lastWeek,
      lastMonth,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // A package published minutes ago legitimately 404s here until npm's
    // download stats catch up, which is not the same as zero downloads.
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      available: false,
      reason: `npm download stats could not be read: ${message}`,
      package: PACKAGE,
      lastDay: null,
      lastWeek: null,
      lastMonth: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}
