import type { ChangeSeverity } from "@schema-watch/core";
import type { EndpointView } from "../types.js";

const SEVERITY_VAR: Record<ChangeSeverity, string> = {
  BREAKING: "var(--breaking)",
  WARNING: "var(--warning)",
  INFO: "var(--info)",
};

export function EndpointRow({
  endpoint,
  active,
  onClick,
}: {
  endpoint: EndpointView;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`endpoint-item ${active ? "endpoint-item--active" : ""}`} onClick={onClick}>
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
  );
}
