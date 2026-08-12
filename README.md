# Schema-Watch

**Catch breaking API changes before your frontend breaks.**

The backend changes `userId` from a string to a number. Nothing throws. You
spend two hours in the debugger before realising the payload changed shape.
Schema-Watch tells you the moment it happens, and names the files that will
break.

## 30-second demo

```bash
npm install
npm run build
npm run demo
```

Open **<http://localhost:4561>**.

A mock backend serves a stable contract, then "ships a breaking change" ten
seconds in. Four alerts land live while you watch:

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

## Use it locally

```bash
schema-watch init --target http://localhost:3001
schema-watch start
```

Point your frontend's API base URL at `http://localhost:4560` instead of your
backend and work normally. The dashboard is on `http://localhost:4561`.

Set `frontendSrcDir` in the generated `schema-watch.config.json` to your app's
`src/` folder to get the "which files reference this endpoint" list.

## Use it in CI

```bash
schema-watch export --out contract.json
schema-watch check --contract contract.json   # exits 1 on a breaking change
```

`examples/github-action/schema-watch.yml` is a working workflow.

## Current status

- ✅ Local monitoring and contract diffing
- ✅ Live dashboard with diff viewer
- ✅ Affected-file detection
- ✅ CI contract checks
- ✅ Accounts, email verification, password reset
- 🚧 Team collaboration features in progress
- 🚧 Production payment integrations in progress

The local tool is free forever and needs no account.

## Docs

| | |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | system design, database schema, API surface |
| [DEPLOYING.md](./DEPLOYING.md) | hosting the cloud backend and app |
| [SECURITY.md](./SECURITY.md) | auth, tokens, password policy, known gaps |
| [BILLING.md](./BILLING.md) | plans, processors, how pricing is enforced |
| [ROADMAP.md](./ROADMAP.md) | what is next, and what is deliberately not built |

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
