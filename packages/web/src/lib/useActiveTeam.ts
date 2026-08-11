import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import type { Me } from "./api";

const ACTIVE_TEAM_KEY = "schema-watch.activeTeam";

type Team = Me["teams"][number];

/**
 * Which team the user is currently looking at. Persisted so a reload does not
 * bounce someone back to a different team than the one they were working in.
 */
export function useActiveTeam(): { activeTeam: Team | null; setActiveTeamId: (id: string) => void } {
  const { user } = useAuth();
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_TEAM_KEY));

  // Fall back to the first team when nothing is stored, or when the stored id
  // refers to a team the user is no longer a member of.
  useEffect(() => {
    if (!user || user.teams.length === 0) return;
    const stillAMember = user.teams.some((t) => t.id === activeTeamId);
    if (!stillAMember) {
      const fallback = user.teams[0]!.id;
      setActiveTeamIdState(fallback);
      localStorage.setItem(ACTIVE_TEAM_KEY, fallback);
    }
  }, [user, activeTeamId]);

  const setActiveTeamId = useCallback((id: string) => {
    setActiveTeamIdState(id);
    localStorage.setItem(ACTIVE_TEAM_KEY, id);
  }, []);

  const activeTeam = user?.teams.find((t) => t.id === activeTeamId) ?? user?.teams[0] ?? null;
  return { activeTeam, setActiveTeamId };
}
