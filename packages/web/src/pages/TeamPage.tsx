import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useActiveTeam } from "../lib/useActiveTeam";

export function TeamPage() {
  const { activeTeam } = useActiveTeam();
  if (!activeTeam) return <div className="page">Create a team first.</div>;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">{activeTeam.name}</div>
          <div className="page__subtitle">
            Plan: {activeTeam.plan} - your role: {activeTeam.role}
          </div>
        </div>
      </div>

      <ApiKeys teamId={activeTeam.id} />
      <InviteMember teamId={activeTeam.id} />
    </div>
  );
}

function ApiKeys({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data: keys } = useQuery({ queryKey: ["api-keys", teamId], queryFn: () => api.listApiKeys(teamId) });

  const create = useMutation({
    mutationFn: (keyLabel: string) => api.createApiKey(teamId, keyLabel),
    onSuccess: (result) => {
      setRevealed(result.key);
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["api-keys", teamId] });
    },
  });

  return (
    <>
      <div className="section-title">API keys</div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Used by the agent's sync mode and the CI gate. The key is shown once and stored only as a hash, so copy it now.
        </div>

        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (label.trim()) create.mutate(label.trim());
          }}
        >
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. github-actions"
            required
          />
          <button className="button button--sm" type="submit" disabled={create.isPending}>
            Create key
          </button>
        </form>

        {create.isError && <div className="alert" style={{ marginTop: 10 }}>{(create.error as Error).message}</div>}

        {revealed && (
          <div className="key-reveal">
            <strong>Copy this now, it will not be shown again:</strong>
            <br />
            {revealed}
          </div>
        )}
      </div>

      {keys?.length === 0 && <div className="empty-note">No API keys yet.</div>}
      {keys?.map((key) => (
        <div className="list-row" key={key.id} style={{ cursor: "default" }}>
          <div className="list-row__main">
            <div className="list-row__title">{key.label}</div>
            <div className="list-row__meta">
              created {new Date(key.createdAt).toLocaleDateString()}
              {key.lastUsedAt ? ` - last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " - never used"}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function InviteMember({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const invite = useMutation({
    mutationFn: (memberEmail: string) => api.addMember(teamId, memberEmail, "MEMBER"),
    onSuccess: () => {
      setEmail("");
      setDone(true);
    },
  });

  return (
    <>
      <div className="section-title">Members</div>
      <div className="card">
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
          Add someone who already has a Schema-Watch account.
        </div>
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setDone(false);
            if (email.trim()) invite.mutate(email.trim());
          }}
        >
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            required
          />
          <button className="button button--sm" type="submit" disabled={invite.isPending}>
            Add
          </button>
        </form>
        {invite.isError && <div className="alert" style={{ marginTop: 10 }}>{(invite.error as Error).message}</div>}
        {done && <div className="alert alert--success" style={{ marginTop: 10 }}>Member added.</div>}
      </div>
    </>
  );
}
