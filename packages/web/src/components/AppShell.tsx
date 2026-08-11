import { Logo } from "@schema-watch/ui";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useActiveTeam } from "../lib/useActiveTeam";

export function AppShell() {
  const { user, signOut } = useAuth();
  const { activeTeam, setActiveTeamId } = useActiveTeam();

  return (
    <>
      <nav className="nav">
        <span className="nav__brand">
          <Logo size={20} />
          Schema-Watch
        </span>

        <div className="nav__links">
          <NavLink to="/" end className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}>
            Projects
          </NavLink>
          <NavLink to="/team" className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}>
            Team
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}>
            Billing
          </NavLink>
        </div>

        <div className="nav__right">
          {user && user.teams.length > 1 && (
            <select
              className="input"
              style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
              value={activeTeam?.id ?? ""}
              onChange={(e) => setActiveTeamId(e.target.value)}
            >
              {user.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
          {activeTeam && <span>{activeTeam.plan}</span>}
          <button className="link-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <Outlet />
    </>
  );
}
