import { readFileSync } from "node:fs";
import { COMMENT_MARKER } from "./format.js";

export interface GitHubContext {
  token: string;
  apiUrl: string;
  owner: string;
  repo: string;
  /** Absent outside pull_request events; the comment is then skipped. */
  prNumber?: number;
  /** Head commit of the PR, which is what a check run must target. */
  sha: string;
}

/** Reads the context GitHub Actions provides through the environment. */
export function readGitHubContext(): GitHubContext | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.INPUT_GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return null;

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) return null;

  let prNumber: number | undefined;
  let sha = process.env.GITHUB_SHA ?? "";

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf-8"));
      prNumber = event.pull_request?.number ?? event.number;
      // On pull_request, GITHUB_SHA is the merge commit, which is not what the
      // Checks UI attaches to; the PR head is.
      if (event.pull_request?.head?.sha) sha = event.pull_request.head.sha;
    } catch {
      // A malformed or unreadable event file just means no PR context.
    }
  }

  return { token, apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com", owner, repo, prNumber, sha };
}

async function api<T>(ctx: GitHubContext, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ctx.apiUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ctx.token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Creates the report comment, or edits the existing one. Without the upsert a
 * busy PR collects a fresh wall of diff on every push.
 */
export async function upsertPullRequestComment(ctx: GitHubContext, body: string): Promise<void> {
  if (!ctx.prNumber) return;

  const existing = await api<{ id: number; body?: string }[]>(
    ctx,
    `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments?per_page=100`,
  );
  const mine = existing.find((c) => c.body?.includes(COMMENT_MARKER));

  if (mine) {
    await api(ctx, `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${mine.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  } else {
    await api(ctx, `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

/**
 * Publishes a check run. This is the piece that can be made a required status
 * check in branch protection, which is what actually blocks a merge - no
 * GitHub App needed.
 */
export async function createCheckRun(
  ctx: GitHubContext,
  args: { pass: boolean; title: string; summary: string },
): Promise<void> {
  if (!ctx.sha) return;

  await api(ctx, `/repos/${ctx.owner}/${ctx.repo}/check-runs`, {
    method: "POST",
    body: JSON.stringify({
      name: "schema-watch",
      head_sha: ctx.sha,
      status: "completed",
      conclusion: args.pass ? "success" : "failure",
      output: {
        title: args.title,
        // The Checks UI truncates well past this, but keep it bounded.
        summary: args.summary.slice(0, 60_000),
      },
    }),
  });
}
