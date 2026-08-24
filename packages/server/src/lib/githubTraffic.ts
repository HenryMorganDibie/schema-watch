/**
 * GitHub repository traffic.
 *
 * This is deliberately kept apart from the first-party analytics in
 * analyticsQueries.ts, and it is not merged into those totals, because the two
 * measure different things and only one of them is trustworthy about people.
 *
 * GitHub counts a clone every time any machine clones the repository. CI
 * runners, mirrors, package caches and crawlers all clone. "159 unique
 * cloners" means 159 distinct sources over 14 days, which is not 159 humans
 * and must never be presented as though it were. Views are closer to real
 * traffic but still include bots.
 *
 * GitHub also only retains 14 days. A longer range on the dashboard cannot be
 * satisfied from this API, so the window is reported alongside the numbers
 * rather than silently stretched to match what the operator selected.
 */

const API = "https://api.github.com";
const OWNER = process.env.GITHUB_REPO_OWNER ?? "HenryMorganDibie";
const REPO = process.env.GITHUB_REPO_NAME ?? "schema-watch";
const TIMEOUT_MS = 8000;

/** GitHub's fixed retention for the traffic endpoints. */
export const GITHUB_RETENTION_DAYS = 14;

export interface TrafficPoint {
  date: string;
  count: number;
  uniques: number;
}

export interface ReferrerRow {
  referrer: string;
  count: number;
  uniques: number;
}

export interface GitHubTraffic {
  /** Null when the integration is not configured or GitHub could not be reached. */
  available: boolean;
  reason: string | null;
  repo: string;
  retentionDays: number;
  views: { total: number; uniques: number; series: TrafficPoint[] } | null;
  clones: { total: number; uniques: number; series: TrafficPoint[] } | null;
  referrers: ReferrerRow[] | null;
  fetchedAt: string;
}

function unavailable(reason: string): GitHubTraffic {
  return {
    available: false,
    reason,
    repo: `${OWNER}/${REPO}`,
    retentionDays: GITHUB_RETENTION_DAYS,
    views: null,
    clones: null,
    referrers: null,
    fetchedAt: new Date().toISOString(),
  };
}

async function get<T>(path: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "schema-watch-analytics",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached because the numbers move once a day at most, the dashboard is
 * refetched far more often than that, and the traffic endpoints count against
 * a shared rate limit.
 */
let cache: { at: number; value: GitHubTraffic } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function githubTraffic(): Promise<GitHubTraffic> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  // GITHUB_TRAFFIC_TOKEN is the canonical name; TRAFFIC_TOKEN is accepted
  // because that is what the deployment already sets.
  const token = process.env.GITHUB_TRAFFIC_TOKEN ?? process.env.TRAFFIC_TOKEN;
  if (!token) {
    // Not an error. The dashboard shows this as unavailable rather than
    // guessing, because a guessed number here would be indistinguishable
    // from a measured one.
    return unavailable("GITHUB_TRAFFIC_TOKEN (or TRAFFIC_TOKEN) is not configured");
  }

  const base = `/repos/${OWNER}/${REPO}/traffic`;
  try {
    // Sequential, not Promise.all: these run inside a serverless invocation
    // and three concurrent outbound calls buy nothing at this volume.
    const views = await get<{ count: number; uniques: number; views: TrafficPoint[] }>(
      `${base}/views`,
      token,
    );
    const clones = await get<{ count: number; uniques: number; clones: TrafficPoint[] }>(
      `${base}/clones`,
      token,
    );
    const referrers = await get<ReferrerRow[]>(`${base}/popular/referrers`, token);

    const value: GitHubTraffic = {
      available: true,
      reason: null,
      repo: `${OWNER}/${REPO}`,
      retentionDays: GITHUB_RETENTION_DAYS,
      views: { total: views.count, uniques: views.uniques, series: views.views ?? [] },
      clones: { total: clones.count, uniques: clones.uniques, series: clones.clones ?? [] },
      referrers: referrers ?? [],
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // A token without push access returns 403 here; that is the common case
    // and worth stating plainly rather than rendering an empty panel.
    const message = err instanceof Error ? err.message : "unknown error";
    return unavailable(`GitHub traffic could not be read: ${message}`);
  }
}
