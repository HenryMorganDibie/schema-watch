import { summarizeChange } from "@schema-watch/core";
import { SeverityBadge } from "./SeverityBadge.js";
import type { ContractChangeView } from "../types.js";

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * One row in the activity feed. Leads with the actual field change rather than
 * a count, because "which field broke" is the question someone opened this
 * tool to answer.
 */
export function ChangeCard({ change, onClick }: { change: ContractChangeView; onClick?: () => void }) {
  const first = change.changes[0];

  return (
    <div className="timeline__item" onClick={onClick}>
      <div className="timeline__item__body">
        <div className="timeline__item__endpoint">
          {change.method} {change.pathPattern}
        </div>

        {first && (
          <div className="timeline__item__change">
            <span className="timeline__item__field">{first.path || "(root)"}</span>
            {first.before && <span className="diff-before">{first.before}</span>}
            {first.before && first.after && <span className="diff-arrow">&rarr;</span>}
            {first.after && <span className="diff-after">{first.after}</span>}
            {!first.before && !first.after && <span className="timeline__item__kind">{summarizeChange(first)}</span>}
            {change.changes.length > 1 && (
              <span className="timeline__item__more">+{change.changes.length - 1} more</span>
            )}
          </div>
        )}

        <div className="timeline__item__meta">
          <SeverityBadge severity={change.severity} size="sm" />
          <span>{timeAgo(change.createdAt)}</span>
          <span>{change.target}</span>
          {change.affectedFiles.length > 0 && (
            <span className="timeline__item__files">
              {change.affectedFiles.length} file{change.affectedFiles.length === 1 ? "" : "s"} affected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
