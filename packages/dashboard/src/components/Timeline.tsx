import { summarizeChange } from "@schema-watch/core";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { SeverityBadge } from "./SeverityBadge";
import type { ContractChangeRecord } from "../lib/types";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function Timeline({
  endpointId,
  onSelectChange,
}: {
  endpointId: string | null;
  onSelectChange: (change: ContractChangeRecord) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: endpointId ? ["changes", endpointId] : ["changes"],
    queryFn: () => api.listChanges(endpointId ?? undefined),
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <div className="timeline">
      {data.map((change) => (
        <div key={change.id} className="timeline__item" onClick={() => onSelectChange(change)}>
          <div className="timeline__item__body">
            <div className="timeline__item__endpoint">
              {change.method} {change.pathPattern}
            </div>

            {/* Lead with the actual field change, not a count - "which field
                broke" is the question the developer opened this tool to answer. */}
            <div className="timeline__item__change">
              <span className="timeline__item__field">{change.changes[0]!.path || "(root)"}</span>
              {change.changes[0]!.before && <span className="diff-before">{change.changes[0]!.before}</span>}
              {change.changes[0]!.before && change.changes[0]!.after && <span className="diff-arrow">&rarr;</span>}
              {change.changes[0]!.after && <span className="diff-after">{change.changes[0]!.after}</span>}
              {!change.changes[0]!.before && !change.changes[0]!.after && (
                <span className="timeline__item__kind">{summarizeChange(change.changes[0]!)}</span>
              )}
              {change.changes.length > 1 && (
                <span className="timeline__item__more">+{change.changes.length - 1} more</span>
              )}
            </div>

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
      ))}
    </div>
  );
}
