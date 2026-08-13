import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type AdminTeam, type Plan } from "../lib/api";
import { useAuth } from "../lib/auth";

const PLANS: Plan[] = ["FREE", "PRO", "TEAM"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Operator console for granting a plan after payment by bank transfer, while
 * a payment processor is still being set up. The API returns 404 to anyone
 * who is not a platform admin, so this page simply never loads for them.
 */
export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [justChanged, setJustChanged] = useState<string | null>(null);

  const { data: teams, isLoading } = useQuery({ queryKey: ["admin-teams"], queryFn: api.adminListTeams });

  const setPlan = useMutation({
    mutationFn: ({ teamId, plan }: { teamId: string; plan: Plan }) => api.adminSetPlan(teamId, plan),
    onSuccess: (_result, variables) => {
      setError(null);
      setJustChanged(variables.teamId);
      queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not change the plan."),
  });

  if (!user?.isPlatformAdmin) return <div className="page">Not found.</div>;
  if (isLoading) return <div className="spinner-note">Loading teams...</div>;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">Operator console</div>
          <div className="page__subtitle">
            Grant a plan after a bank transfer clears. Recorded as a manual payment, not as a processor charge.
          </div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {teams?.length === 0 && <div className="empty-note">No teams yet.</div>}

      <div className="admin-list">
        {teams?.map((team: AdminTeam) => (
          <div key={team.id} className="admin-row">
            <div className="admin-row__main">
              <div className="admin-row__name">
                {team.name}
                <span className={`plan-tag plan-tag--${team.plan.toLowerCase()}`}>{team.plan}</span>
                {team.billingProvider && <span className="admin-row__provider">{team.billingProvider}</span>}
                {justChanged === team.id && <span className="admin-row__saved">saved</span>}
              </div>
              <div className="admin-row__meta">
                {team.members.map((m) => m.email).join(", ")} · {team.projectCount} project
                {team.projectCount === 1 ? "" : "s"} · joined {formatDate(team.createdAt)}
              </div>
            </div>

            <div className="admin-row__actions">
              {PLANS.map((plan) => (
                <button
                  key={plan}
                  className={`button button--sm ${team.plan === plan ? "" : "button--secondary"}`}
                  disabled={team.plan === plan || setPlan.isPending}
                  onClick={() => setPlan.mutate({ teamId: team.id, plan })}
                >
                  {plan}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
