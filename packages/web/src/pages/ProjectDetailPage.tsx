import { ChangeCard, DiffViewer, EndpointRow, type ContractChangeView } from "@schema-watch/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, API_BASE } from "../lib/api";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<ContractChangeView | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => api.listEndpoints(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: changes } = useQuery({
    queryKey: ["changes", selectedEndpointId],
    queryFn: () => api.listChanges(selectedEndpointId!),
    enabled: Boolean(selectedEndpointId),
  });

  if (isLoading) return <div className="spinner-note">Loading project...</div>;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">Contract activity</div>
          <div className="page__subtitle mono">{projectId}</div>
        </div>
        <Link to="/" className="button button--secondary button--sm">
          All projects
        </Link>
      </div>

      {(!endpoints || endpoints.length === 0) && <ConnectInstructions projectId={projectId!} />}

      {endpoints && endpoints.length > 0 && (
        <>
          <div className="section-title">Endpoints ({endpoints.length})</div>
          <div style={{ marginBottom: 20 }}>
            {endpoints.map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                active={selectedEndpointId === endpoint.id}
                onClick={() => {
                  setSelectedEndpointId((prev) => (prev === endpoint.id ? null : endpoint.id));
                  setSelectedChange(null);
                }}
              />
            ))}
          </div>

          {selectedChange ? (
            <DiffViewer change={selectedChange} onBack={() => setSelectedChange(null)} />
          ) : (
            selectedEndpointId && (
              <>
                <div className="section-title">History</div>
                {changes?.length === 0 && <div className="empty-note">No contract changes recorded yet.</div>}
                <div className="timeline">
                  {changes?.map((change) => (
                    <ChangeCard key={change.id} change={change} onClick={() => setSelectedChange(change)} />
                  ))}
                </div>
              </>
            )
          )}
        </>
      )}

      <div className="section-title">Status badge</div>
      <div className="card">
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
          Paste this into your README. It turns red the moment a contract breaks.
        </div>
        <div className="code-block">{`![API contract](${API_BASE || "https://api.schema-watch.dev"}/api/badge/${projectId}.svg)`}</div>
      </div>
    </div>
  );
}

function ConnectInstructions({ projectId }: { projectId: string }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Connect this project</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.55 }}>
        Nothing has been reported yet. Mint an API key under Team, then run the agent with sync enabled:
      </div>
      <div className="code-block">
        {`npx schema-watch init --target http://localhost:3001

# in schema-watch.config.json
"sync": {
  "enabled": true,
  "projectId": "${projectId}",
  "apiKey": "sw_live_...",
  "cloudUrl": "${API_BASE || "https://api.schema-watch.dev"}"
}

npx schema-watch start`}
      </div>
    </div>
  );
}
