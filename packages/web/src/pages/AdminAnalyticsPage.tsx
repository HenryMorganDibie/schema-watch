import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityChart } from "../components/ActivityChart";
import { api, type AnalyticsSummary } from "../lib/api";
import { useAuth } from "../lib/auth";

const RANGES = [7, 30, 90] as const;

const EVENT_LABEL: Record<string, string> = {
  page_view: "Page view",
  try_cloud_clicked: "Arrived from a link",
  signup_started: "Signup started",
  signup_completed: "Signup completed",
  email_verification_started: "Opened verification link",
  email_verification_completed: "Email verified",
  login: "Login",
  agent_connected: "Agent connected",
  ci_check_run: "CI check",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function Stat({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      {/* null means the number cannot be measured, which is not the same as
          zero. Showing 0 would read as "nobody used it". */}
      <div className={`stat__value ${value === null ? "stat__value--unavailable" : ""}`}>
        {value === null ? "unavailable" : value.toLocaleString()}
      </div>
      {note && <div className="stat__note">{note}</div>}
    </div>
  );
}

/**
 * Private operator analytics: did anyone show up after a public post, and
 * where did they stop. The API returns 404 to non-admins, so this page simply
 * never loads for anyone else.
 */
export function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<number>(30);

  const { data, isLoading, isError } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics", range],
    queryFn: () => api.analyticsSummary(range),
    enabled: Boolean(user?.isPlatformAdmin),
  });

  if (!user?.isPlatformAdmin) return <div className="page">Not found.</div>;
  if (isLoading) return <div className="spinner-note">Loading analytics...</div>;
  if (isError || !data) return <div className="page">Could not load analytics.</div>;

  const m = data.metrics;
  const top = data.funnel[0]?.count ?? 0;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">Analytics</div>
          <div className="page__subtitle">Private to operators. Nothing here is exposed publicly.</div>
        </div>
        <div className="range-picker">
          {RANGES.map((r) => (
            <button
              key={r}
              className={`button button--sm ${range === r ? "" : "button--secondary"}`}
              onClick={() => setRange(r)}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Total users" value={m.totalUsers} />
        <Stat label="Active users" value={m.activeUsers} note={`acted in ${range}d`} />
        <Stat label="Projects" value={m.projects} />
        <Stat label="Active projects" value={m.activeProjects} note={`captured in ${range}d`} />
        <Stat label="Schemas captured" value={m.schemasCaptured} />
        <Stat label="Breaking changes" value={m.breakingChanges} />
        <Stat label="CI checks" value={m.ciChecks} />
        <Stat label="MCP usage" value={m.mcpUsage} note="runs locally, never reports" />
      </div>

      <div className="section-title">Activity · last {range} days</div>
      <div className="card">
        <ActivityChart points={data.series} />
      </div>

      <div className="section-title">Funnel · last {range} days</div>
      <div className="card">
        {data.funnel.map((step) => {
          const pct = top > 0 ? Math.min(100, Math.round((step.count / top) * 100)) : 0;
          return (
            <div className="funnel-step" key={step.label}>
              <div className="funnel-step__head">
                <span>{step.label}</span>
                <span className="funnel-step__count">
                  {step.count.toLocaleString()}
                  {top > 0 && <span className="funnel-step__pct"> · {pct}%</span>}
                </span>
              </div>
              <div className="funnel-step__bar">
                <span style={{ width: `${Math.max(pct, step.count > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          );
        })}
        {top === 0 && <div className="empty-note">No visitors recorded yet in this window.</div>}
        <div className="funnel-note">
          Later steps count real records, earlier ones count browser events, so a step can exceed the one above it if a
          signup happened without the page being tracked (an ad blocker, or an account made through the API).
        </div>
      </div>

      <div className="section-title">Recent activity</div>
      <div className="card">
        {data.recent.length === 0 && <div className="empty-note">Nothing recorded yet.</div>}
        {data.recent.map((row) => (
          <div className="activity-row" key={row.id}>
            <span className="activity-row__event">{EVENT_LABEL[row.eventName] ?? row.eventName}</span>
            <span className="activity-row__actor">{row.actor}</span>
            {row.projectName && <span className="activity-row__project">{row.projectName}</span>}
            <span className="activity-row__time">{timeAgo(row.occurredAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
