import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, ApiError, type IntegrationSummary, type Severity } from "../lib/api";

const SEVERITIES: Severity[] = ["BREAKING", "WARNING", "INFO"];

const PLACEHOLDER: Record<"SLACK" | "DISCORD", string> = {
  SLACK: "https://hooks.slack.com/services/...",
  DISCORD: "https://discord.com/api/webhooks/...",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function IntegrationRow({ projectId, integration }: { projectId: string; integration: IntegrationSummary }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integrations", projectId] });

  const test = useMutation({
    mutationFn: () => api.testIntegration(projectId, integration.id),
    onSuccess: () => {
      setMessage({ ok: true, text: "Delivered. Check the channel." });
      invalidate();
    },
    onError: (err) => {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Delivery failed." });
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: (patch: { enabled?: boolean; minSeverity?: Severity }) =>
      api.updateIntegration(projectId, integration.id, patch),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteIntegration(projectId, integration.id),
    onSuccess: invalidate,
  });

  const { data: deliveries } = useQuery({
    queryKey: ["deliveries", integration.id],
    queryFn: () => api.listDeliveries(projectId, integration.id),
    enabled: showLog,
  });

  return (
    <div className={`integration ${integration.enabled ? "" : "integration--disabled"}`}>
      <div className="integration__head">
        <span className="integration__type">{integration.type}</span>
        <span className="integration__host">{integration.webhookHost}</span>
        {!integration.enabled && <span className="integration__badge">disabled</span>}
      </div>

      <div className="integration__meta">
        Notifies on{" "}
        <select
          className="input input--inline"
          value={integration.minSeverity}
          onChange={(e) => update.mutate({ minSeverity: e.target.value as Severity })}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s === "BREAKING" ? "breaking only" : s === "WARNING" ? "warning and above" : "everything"}
            </option>
          ))}
        </select>{" "}
        · last delivery {timeAgo(integration.lastDeliveryAt)}
      </div>

      {integration.lastError && (
        <div className="integration__error">
          Last failure: {integration.lastError}
          {integration.consecutiveFailures >= 5 && " (auto-disabled after 5 consecutive failures)"}
        </div>
      )}

      {message && <div className={message.ok ? "integration__ok" : "integration__error"}>{message.text}</div>}

      <div className="integration__actions">
        <button className="button button--sm button--secondary" disabled={test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Sending..." : "Send test"}
        </button>
        <button
          className="button button--sm button--secondary"
          onClick={() => update.mutate({ enabled: !integration.enabled })}
        >
          {integration.enabled ? "Disable" : "Enable"}
        </button>
        <button className="button button--sm button--secondary" onClick={() => setShowLog((v) => !v)}>
          {showLog ? "Hide log" : "Delivery log"}
        </button>
        <button className="button button--sm button--secondary" onClick={() => remove.mutate()}>
          Remove
        </button>
      </div>

      {showLog && (
        <div className="delivery-log">
          {deliveries?.length === 0 && <div className="delivery-log__empty">No deliveries yet.</div>}
          {deliveries?.map((d) => (
            <div key={d.id} className="delivery-log__row">
              <span className={d.status === "SUCCESS" ? "delivery-log__ok" : "delivery-log__fail"}>
                {d.status === "SUCCESS" ? "✓" : "✕"}
              </span>
              <span className="delivery-log__summary">{d.summary}</span>
              <span className="delivery-log__time">{timeAgo(d.createdAt)}</span>
              {d.error && <span className="delivery-log__error">{d.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Integrations({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"SLACK" | "DISCORD">("SLACK");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minSeverity, setMinSeverity] = useState<Severity>("BREAKING");
  const [error, setError] = useState<string | null>(null);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations", projectId],
    queryFn: () => api.listIntegrations(projectId),
  });

  const add = useMutation({
    mutationFn: () => api.addIntegration(projectId, type, webhookUrl.trim(), minSeverity),
    onSuccess: () => {
      setWebhookUrl("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["integrations", projectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not add that webhook."),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;
    add.mutate();
  };

  return (
    <section className="panel">
      <div className="panel__title">Alerts</div>
      <p className="panel__subtitle">
        Post contract changes to Slack or Discord. The webhook is stored write-only and never shown again.
      </p>

      {isLoading && <div className="spinner-note">Loading...</div>}

      {integrations?.map((i) => (
        <IntegrationRow key={i.id} projectId={projectId} integration={i} />
      ))}

      <form className="integration-form" onSubmit={submit}>
        <select className="input input--inline" value={type} onChange={(e) => setType(e.target.value as "SLACK" | "DISCORD")}>
          <option value="SLACK">Slack</option>
          <option value="DISCORD">Discord</option>
        </select>
        <input
          className="input"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder={PLACEHOLDER[type]}
        />
        <select
          className="input input--inline"
          value={minSeverity}
          onChange={(e) => setMinSeverity(e.target.value as Severity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s === "BREAKING" ? "breaking only" : s === "WARNING" ? "warning and above" : "everything"}
            </option>
          ))}
        </select>
        <button className="button button--sm" type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding..." : "Add"}
        </button>
      </form>

      {error && <div className="alert">{error}</div>}
    </section>
  );
}
