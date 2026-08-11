import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useActiveTeam } from "../lib/useActiveTeam";

export function ProjectsPage() {
  const { user } = useAuth();
  const { activeTeam } = useActiveTeam();

  if (!user) return null;
  if (user.teams.length === 0) return <CreateFirstTeam />;
  if (!activeTeam) return null;

  return <ProjectList teamId={activeTeam.id} teamName={activeTeam.name} />;
}

function CreateFirstTeam() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (teamName: string) => api.createTeam(teamName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <div className="page__title">Create your team</div>
      <div className="page__subtitle" style={{ marginBottom: 18 }}>
        Projects, API keys, and billing all belong to a team. You can invite people later.
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="team">
            Team name
          </label>
          <input
            id="team"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Engineering"
            required
          />
        </div>
        {create.isError && <div className="alert">{(create.error as Error).message}</div>}
        <button className="button" type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating..." : "Create team"}
        </button>
      </form>
    </div>
  );
}

function ProjectList({ teamId, teamName }: { teamId: string; teamName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", teamId],
    queryFn: () => api.listProjects(teamId),
  });

  const create = useMutation({
    mutationFn: (projectName: string) => api.createProject(teamId, projectName),
    onSuccess: () => {
      setName("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["projects", teamId] });
    },
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__title">Projects</div>
          <div className="page__subtitle">{teamName}</div>
        </div>
        <button className="button button--sm" onClick={() => setShowForm((v) => !v)}>
          New project
        </button>
      </div>

      {showForm && (
        <form
          className="card"
          style={{ marginBottom: 16 }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor="project">
              Project name
            </label>
            <input
              id="project"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme API"
              required
            />
          </div>
          {create.isError && <div className="alert">{(create.error as Error).message}</div>}
          <button className="button button--sm" type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {isLoading && <div className="spinner-note">Loading projects...</div>}

      {projects?.length === 0 && !showForm && (
        <div className="empty-note">
          No projects yet. Create one, then point the agent at it with its project id.
        </div>
      )}

      {projects?.map((project) => (
        <button key={project.id} className="list-row" onClick={() => navigate(`/projects/${project.id}`)}>
          <div className="list-row__main">
            <div className="list-row__title">{project.name}</div>
            <div className="list-row__meta mono">{project.id}</div>
          </div>
          <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
        </button>
      ))}
    </div>
  );
}
