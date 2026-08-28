# Schema-Watch

[![npm](https://img.shields.io/npm/v/schema-watch)](https://www.npmjs.com/package/schema-watch)
[![schema-watch](https://github.com/HenryMorganDibie/schema-watch/actions/workflows/schema-watch.yml/badge.svg)](https://github.com/HenryMorganDibie/schema-watch/actions/workflows/schema-watch.yml)
[![core license](https://img.shields.io/badge/core-Apache--2.0-blue)](#licensing)

**Catch breaking API changes before they reach your users.**

Your API changed. Schema-Watch tells you exactly what broke.

```console
$ npx schema-watch check --baseline .schema-watch/baseline.json

BREAKING  GET /api/users/:id (response)
    id: number → string
    email was removed (was string)

Breaking API contract changes detected.
```

Exit code `1`, so your build fails instead of your frontend.

## Try it in 30 seconds

Needs Node 22.5 or newer. No account, no signup, nothing to configure, and
nothing leaves your machine.

```bash
npx schema-watch init --target http://localhost:3001   # your backend
npx schema-watch start
```

Point your frontend at `http://localhost:4560` and use your app normally. The
dashboard is on `http://localhost:4561`, and every endpoint you touch is now
under contract.

Set `frontendSrcDir` in the generated `schema-watch.config.json` to your app's
`src/` folder, and each breaking change also lists the files that reference the
endpoint.

The backend changes `userId` from a string to a number. Nothing throws. You
spend two hours in the debugger before realising the payload changed shape.
Schema-Watch tells you the moment it happens, and names the frontend files that
will break.

## See it break, without wiring up your own app

```bash
git clone https://github.com/HenryMorganDibie/schema-watch && cd schema-watch
npm install && npm run build && npm run demo
```

Open **<http://localhost:4561>**. A mock backend serves a stable contract, then
ships a breaking change ten seconds in. Four alerts land live while you watch:

| Endpoint | Change | Verdict |
| --- | --- | --- |
| `GET /api/users/:id` | `userId` string to number | Breaking, 3 files affected |
| `GET /api/orders/:id` | `total` number to string | Breaking, 2 files affected |
| `GET /api/session` | `user` object to null | Breaking |
| `GET /api/projects` | `items[].archived` added | Safe |

## What it catches

- Field type changes
- Removed fields
- Nullability changes
- Optional to required changes
- Array item shape changes

Each is graded by how likely it is to break a caller, and the grade depends on
direction: a newly required field breaks a *request* body but is harmless in a
*response*.

## Why it's different

Schema-Watch diffs **payload shape**, not values. Changing timestamps, IDs and
counts produce no noise at all, so an alert always means something real.

That last row in the table above is the point: values jitter on every request
in the demo and nothing fires. A tool that cries wolf on every changed
timestamp is worse than no tool.

## Give an AI chat the same context

Instead of re-explaining your API surface to a new chat, hand it what
Schema-Watch has already captured:

```bash
npx schema-watch context --claude-md   # upserts a section into CLAUDE.md
npx schema-watch context --out CONTEXT.md
```

Or let an MCP-aware coding agent (Claude Code, Cursor) pull it live instead of
reading a file: see [`packages/mcp`](./packages/mcp) for the local MCP server.

## Use it in CI

No account required. Commit a baseline contract, then compare against it:

```bash
npx schema-watch export --out contract.json
npx schema-watch check   --contract contract.json   --baseline .schema-watch/baseline.json   --frontend-src src   --sarif schema-watch.sarif     # exits 1 on a breaking change
```

Copy [`examples/github-action/schema-watch.yml`](./examples/github-action/schema-watch.yml)
into `.github/workflows/` and it will:

- **comment on the PR** with a diff of what changed and which files reference it
- **publish a check run** you can require in branch protection to block merges
- **upload SARIF** so findings appear in the Security tab beside static analysis

All using the built-in `GITHUB_TOKEN`. No secret to configure.

## We run it on ourselves

This repository's own CI captures the contract of the deployed Schema-Watch
API on every pull request and compares it against a committed baseline. The
workflow is [`.github/workflows/schema-watch.yml`](./.github/workflows/schema-watch.yml),
and [PR #1](https://github.com/HenryMorganDibie/schema-watch/pull/1) is a
deliberate contract break kept open so you can see the failing check, the bot
comment and the SARIF findings for yourself.

## Open source vs Cloud

**The repo helps you detect breaking changes. The Cloud helps your team
coordinate, enforce and manage them across repositories and pull requests.**

### Free, open source, self-hostable

- Local proxy and live dashboard
- Shape diffing and severity rules
- Affected-file detection
- `export` and `check` in your own CI, including PR comments, check runs and SARIF
- Unlimited personal and commercial use

Everything above runs with no account, and makes no network calls unless you
ask it to: cloud `sync`, the cloud CI gate, and
[opt-in telemetry](./docs/PRIVACY.md#opt-in-cli-telemetry) are each off until
you switch them on. It is the whole detection engine, and it stays free.

### Schema-Watch Cloud

Live today:

- Hosted history and a schema timeline: *when* did `userId` become a number
- A shared CI baseline across branches, so a check does not depend on a
  committed file being up to date
- Slack and Discord alerts, with delivery tracking and automatic disabling of
  dead webhooks
- Teams, roles and a public status badge

Planned, and not built yet:

- **Cross-repository impact analysis** - one backend change, every consuming
  repo listed with the exact files
- GitHub App with branded PR reviews and inline comments on the changed line
- Organization-wide policies and managed required checks
- Audit logs

The planned items need centralised data across repositories, hosted
integrations and background sync. They are the parts that are genuinely
painful to run yourself, not artificial limits on the parts that are not.

Cloud signup is **early access**: the app is deployed and running, but public
self-service signup is still being finished, because production email delivery
is waiting on a custom domain. The local tool needs none of that and is free
forever.

## Coming soon

**Schema-Watch GitHub App** - branded PR reviews, inline contract warnings on
the exact changed line, and organization-wide policy enforcement.

## Current status

- ✅ Local monitoring and contract diffing
- ✅ Live dashboard with diff viewer
- ✅ Affected-file detection
- ✅ CI contract checks
- ✅ Accounts, email verification, password reset
- ✅ Slack and Discord alerts with delivery tracking
- ✅ Hosted Cloud app deployed and running
- 🚧 Public Cloud signup, pending a custom domain for production email
- 🚧 Team collaboration features in progress
- 🚧 Production payment integrations in progress

The local tool is free forever and needs no account.

## Docs

| | |
| --- | --- |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | system design, database schema, API surface |
| [DEPLOYING.md](./docs/DEPLOYING.md) | hosting the cloud backend and app |
| [SECURITY.md](./SECURITY.md) | auth, tokens, password policy, known gaps |
| [BILLING.md](./docs/BILLING.md) | plans, processors, how pricing is enforced |
| [ROADMAP.md](./docs/ROADMAP.md) | what is next, and what is deliberately not built |
| [PRIVACY.md](./docs/PRIVACY.md) | what telemetry is collected, and what never is |
| [SECURITY-ROADMAP.md](./docs/SECURITY-ROADMAP.md) | what is still outstanding before serious public adoption |

## Licensing

### GitHub's repository label

GitHub shows only the root license for a repository. This one is dual-licensed:
the open-source packages (`core`, `agent`, `ui`, `dashboard`, `web`) are
**Apache-2.0**, and the hosted Cloud backend (`packages/server`) is licensed
separately under **BUSL-1.1**.

### Open Source

Schema-Watch's local detection engine, CLI, agent and UI are available under
**Apache-2.0**. Use, modify, self-host and ship commercially, with no strings.

That covers `packages/core`, `packages/agent`, `packages/ui`,
`packages/dashboard` and `packages/web` - everything a developer runs on
their own machine, and the whole detection engine.

### Schema-Watch Cloud

The hosted service and server-side components (`packages/server`) are licensed
separately under the **Business Source License 1.1**. Commercial hosted use is
subject to the applicable terms.

In practice: you may use and self-host it freely, including in production. The
single restriction is that you may not offer it to third parties as a
competing hosted contract-monitoring service. It converts to Apache-2.0 on
2030-08-13.

Full texts: [LICENSE](./LICENSE) and [packages/server/LICENSE](./packages/server/LICENSE).

## Repo layout

```text
packages/
  core/        schema inference + diff engine (framework-agnostic, unit tested)
  agent/       local reverse proxy + SQLite + REST/WS API + CLI
  ui/          presentational components + design tokens shared by both apps
  dashboard/   local live UI, served by the agent
  web/         cloud app - signup, teams, projects, API keys, billing
  server/      cloud backend - accounts, teams, billing, CI gate, Slack, badge
```

## Tests

```bash
npm run test --workspace packages/core
npm run typecheck --workspaces
```

The diff engine's rules are written as executable tests in
[`packages/core/src/diff.test.ts`](./packages/core/src/diff.test.ts) - the
fastest way to understand what the product actually does.
