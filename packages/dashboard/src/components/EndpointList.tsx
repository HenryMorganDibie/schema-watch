import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { EndpointSummary } from "../lib/types";

const SEVERITY_VAR: Record<string, string> = {
  BREAKING: "var(--breaking)",
  WARNING: "var(--warning)",
  INFO: "var(--info)",
};

export function EndpointList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (endpoint: EndpointSummary) => void;
}) {
  const { data, isLoading } = useQuery({ queryKey: ["endpoints"], queryFn: api.listEndpoints });

  if (isLoading) {
    return <div className="sidebar__section-label">Loading endpoints…</div>;
  }

  if (!data || data.length === 0) {
    return <div className="sidebar__section-label">No endpoints captured yet</div>;
  }

  return (
    <div className="endpoint-list">
      <div className="sidebar__section-label">Endpoints ({data.length})</div>
      {data.map((endpoint) => (
        <button
          key={endpoint.id}
          className={`endpoint-item ${selectedId === endpoint.id ? "endpoint-item--active" : ""}`}
          onClick={() => onSelect(endpoint)}
        >
          <span className="endpoint-item__method">{endpoint.method}</span>
          <span className="endpoint-item__path">{endpoint.pathPattern}</span>
          {endpoint.latestSeverity && (
            <span
              className="endpoint-item__dot"
              style={{ background: SEVERITY_VAR[endpoint.latestSeverity] }}
              title={endpoint.latestSeverity}
            />
          )}
        </button>
      ))}
    </div>
  );
}
