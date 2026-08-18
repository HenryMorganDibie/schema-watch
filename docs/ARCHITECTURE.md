# Schema-Watch - System Architecture

Breaking API contract changes, caught the millisecond they happen, not two hours into
debugging state management.

## 1. Product shape

Two runtime halves that share one diffing engine:

- **Local Agent** - a reverse proxy you point your frontend at instead of hitting the
  backend directly. It passes every request through untouched, but snapshots the JSON
  shape of each request/response pair, diffs it against the last snapshot for that
  endpoint, and raises an alert the instant a field's type, presence, or nullability
  changes. Ships a localhost dashboard. Runs entirely offline - no account needed.
- **Cloud Backend** - optional. Sign in and the agent syncs snapshots to a team
  workspace: history beyond local disk, Slack/Discord alerts, a CI endpoint that can
  fail a PR on a breaking change, and multi-project/multi-user dashboards.

A Chrome DevTools extension is a third UI surface planned for phase 2 (see §7) - it
talks to the *same* local agent API the web dashboard uses, so it's additive, not a
rewrite.

```
                     ┌────────────────────────────────────────────┐
                     │              Developer's machine             │
                     │                                              │
  Frontend  ───────▶ │  Local Agent (proxy :4560)                  │
  (dev server)        │   ├─ capture → @schema-watch/core diff       │
                     │   ├─ SQLite (schema-watch.db)                │
                     │   ├─ REST + WS API (:4561)                   │
                     │   └─ serves Dashboard SPA (:4561)            │
                     │        ▲                                     │
                     │        │ same API, later                     │
                     │   Chrome Extension (phase 2)                 │
                     └────────────┼─────────────────────────────────┘
                                  │ optional sync (Pro/Team, API key)
                                  ▼
                     ┌────────────────────────────────────────────┐
                     │           Cloud Backend (Fastify)            │
                     │   /api/auth  /api/teams  /api/projects       │
                     │   /api/projects/:id/snapshots (ingest+diff)  │
                     │   /api/ci/check   (CI gate)                  │
                     │   /api/billing    (Stripe)                   │
                     │   Postgres (Prisma) ── Slack/Discord webhook │
                     └────────────────────────────────────────────┘
```

## 2. Why a proxy, not a passive sniffer

A passive network sniffer (packet capture) is fragile on HTTPS and can't see traffic
across processes cleanly on Windows/macOS without cert trust gymnastics per app. A
**reverse proxy the frontend dev already points at** (swap `NEXT_PUBLIC_API_URL` from
`https://api.example.com` to `http://localhost:4560`) sees clean, already-decrypted
JSON on both legs, with zero cert installation. It costs one env var change and buys
reliability. This is the same trick tools like `mockoon` and `msw`'s node server use.

## 3. Repo layout (npm workspaces monorepo)

```
schema-watch/
  package.json                 root workspace + shared scripts
  tsconfig.base.json
  docker-compose.yml           local Postgres for the cloud backend
  .env.example
  ARCHITECTURE.md
  packages/
    core/                      pure TS: schema inference + diff + breaking-change rules
      src/{types,infer,diff,index}.ts
    agent/                     local proxy + CLI + sqlite + local REST/WS API
      src/{cli,config}.ts
      src/proxy/{server,capture}.ts
      src/storage/{sqlite,queries}.ts
      src/sync/cloudClient.ts
      src/api/{server,routes,ws}.ts
    dashboard/                 React + Vite SPA, served by the agent
      src/{main,App}.tsx
      src/components/*.tsx
      src/hooks/useLiveFeed.ts
      src/lib/api.ts
    server/                    cloud backend: Fastify + Prisma + Postgres
      prisma/schema.prisma
      src/app.ts
      src/routes/{auth,teams,projects,snapshots,ci,billing,integrations}.ts
      src/lib/{prisma,jwt,password,diffProject}.ts
      src/plugins/authenticate.ts
    mcp/                       local MCP server: same captured context as `schema-watch
                               context`, served live over stdio to a coding agent
      src/index.ts
  extension/
    README.md                  phase-2 scaffold notes (not built yet)
```

## 4. Core diffing engine (`@schema-watch/core`)

Framework-agnostic, used by both the agent (local diff) and the server (CI diff), so
the rules only exist once.

- `infer.ts` - walks a JSON value and produces a structural `SchemaNode` tree: type
  (including `"null"` union detection), nested object shape, array element shape
  (sampled/merged across elements), optional vs required keys.
- `diff.ts` - walks two `SchemaNode` trees for the same endpoint and produces a list of
  `SchemaChange` entries: `field-removed`, `field-added`, `type-changed`,
  `became-nullable`, `became-non-nullable`, `required-to-optional`,
  `optional-to-required`, `array-item-type-changed`.
- Each `SchemaChange` is classified `BREAKING | WARNING | INFO`:
  - **BREAKING**: field removed, type changed, required field added, response field
    went from non-nullable to nullable while a narrower type was assumed downstream.
  - **WARNING**: new optional field, array element shape widened.
  - **INFO**: new endpoint seen for the first time, cosmetic key reorder.

## 5. Database schema

### 5a. Local agent - SQLite (`schema-watch.db`, one file per project checkout)

```
endpoints(id, method, path_pattern, created_at)
snapshots(id, endpoint_id, target ENUM('request','response'), status_code,
          schema_json, hash, created_at)
changes(id, endpoint_id, severity ENUM('breaking','warning','info'), summary,
        details_json, from_snapshot_id, to_snapshot_id, acknowledged, created_at)
```

Indexes: `snapshots(endpoint_id, target, created_at)`, `changes(endpoint_id, created_at)`.
`hash` (sha256 of the normalized schema tree) lets capture skip the diff entirely when
nothing changed - the hot path on every request.

### 5b. Cloud backend - Postgres (Prisma), see `packages/server/prisma/schema.prisma`

```
User(id, email UNIQUE, password_hash, name, created_at)
Team(id, name, slug UNIQUE, plan ENUM('FREE','PRO','TEAM'), stripe_customer_id,
     stripe_subscription_id, created_at)
TeamMember(id, team_id FK, user_id FK, role ENUM('OWNER','ADMIN','MEMBER'),
           UNIQUE(team_id, user_id))
ApiKey(id, key_hash UNIQUE, label, team_id FK, last_used_at, created_at)
Project(id, name, slug, team_id FK, UNIQUE(team_id, slug))
Endpoint(id, project_id FK, method, path_pattern, UNIQUE(project_id, method, path_pattern))
SchemaSnapshot(id, endpoint_id FK, target, status_code, schema JSONB, hash, created_at)
ContractChange(id, endpoint_id FK, severity, summary, details JSONB,
                from_snapshot_id, to_snapshot_id, acknowledged, created_at)
Integration(id, project_id FK, type ENUM('SLACK','DISCORD','GITHUB'), config JSONB)
```

This is the same shape as the SQLite schema plus the account/billing/team layer around
it - the agent's local snapshot format is designed to serialize 1:1 into
`SchemaSnapshot` rows so sync is a straight POST, no translation layer.

## 6. API endpoints

### Local agent (`http://localhost:4561`, no auth - localhost only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/endpoints` | list captured endpoints + latest severity |
| GET | `/api/endpoints/:id/changes` | change history for one endpoint |
| GET | `/api/endpoints/:id/snapshots/:snapshotId` | full schema tree for a snapshot |
| POST | `/api/endpoints/:id/changes/:changeId/ack` | dismiss an alert |
| WS | `/ws` | live push of new `ContractChange` events |

### Cloud backend (`/api/*`, JWT or API-key auth)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` \| `/api/auth/login` | account auth, returns JWT |
| GET | `/api/auth/me` | current user + teams |
| POST | `/api/teams` | create team (creator becomes OWNER) |
| POST | `/api/teams/:teamId/members` | invite/add member |
| POST | `/api/teams/:teamId/projects` | create project |
| POST | `/api/teams/:teamId/api-keys` | mint an API key (used by CI / agent sync) |
| POST | `/api/projects/:projectId/snapshots` | agent/CI pushes a snapshot; server diffs vs latest, stores `ContractChange`, fans out to integrations |
| GET | `/api/projects/:projectId/endpoints` | list endpoints for a project |
| GET | `/api/endpoints/:id/changes` | change history (cloud) |
| POST | `/api/ci/check` | **CI gate**: body = current snapshots; returns `{ pass, breakingChanges[] }` - wire into a GitHub Action, exit non-zero on `pass: false` |
| POST | `/api/projects/:projectId/integrations` | add Slack/Discord webhook or GitHub repo link |
| POST | `/api/billing/checkout-session` | Stripe Checkout for FREE→PRO/TEAM upgrade |
| POST | `/api/billing/webhook` | Stripe webhook → updates `Team.plan` |

Auth: interactive users get a JWT (`Authorization: Bearer`); CI and the local agent's
sync mode use a long-lived API key (`X-Api-Key`), scoped to one team.

## 7. UI architecture

**Dashboard SPA** (React + Vite + Zustand + React Query), same code serves local mode
(pointed at `:4561`) and cloud mode (pointed at the hosted API) - it's the same REST/WS
shape by design.

```
App
 ├─ Sidebar: EndpointList (grouped by METHOD + path, severity dot per row)
 ├─ Header: connection status, project/team switcher (cloud mode only)
 └─ Main
     ├─ Timeline: reverse-chron feed of ContractChange, filter by severity
     └─ DiffViewer: selected change - before/after schema tree, red/yellow/green
                     line-level diff, "3 components potentially affected" hint
                     (grep of frontend src/ for the endpoint path, phase 2)
```

State: React Query owns server cache (endpoint list, history); a small Zustand store
holds the live WS feed and merges incoming events into the React Query cache directly
(no polling). Toast/banner fires on any `BREAKING` event regardless of which panel is
open.

**Phase 2 - Chrome DevTools extension**: a new DevTools panel, same `DiffViewer` /
`Timeline` components reused via a shared `dashboard` package export, fetching from
`http://localhost:4561` (local) or the cloud API with a stored token. No engine
duplication - it's a second shell around the same components and the same agent API.

## 8. Pricing tiers → what gates what

| | Free | Pro ($8-15/mo) | Team ($20-40/user/mo) |
|---|---|---|---|
| Local monitoring | ✅ unlimited endpoints, local-only | ✅ | ✅ |
| Cloud history sync | 7-day, 1 project | unlimited history, unlimited projects | + org-wide |
| Slack/Discord alerts | ❌ | ✅ | ✅ |
| CI gate (`/api/ci/check`) | ❌ | ✅ (1 repo) | ✅ (unlimited) |
| Team seats / shared dashboards | ❌ | ❌ | ✅ |

`Team.plan` is the single source of truth; route handlers check it via a
`requirePlan()` guard rather than scattering feature flags.

## 9. What makes this one-of-a-kind (implemented, not roadmap)

Most "JSON diff" tools drown you in noise because they diff *values* (every timestamp,
every UUID looks like a breaking change). Schema-Watch diffs *shape* (type/optionality/
nesting), so a normal request that happens to have a new `createdAt` value never fires
an alert - only an actual contract change does. Two features build directly on top of
that signal quality and ship in this MVP:

- **Affected-component detection.** The exact scenario from the product brief: when a
  `BREAKING` change fires, the agent greps a configured frontend `src/` directory for
  literal usages of the endpoint's path (string literals, template-literal fetch calls,
  React Query key arrays) and attaches the matching file list to the `ContractChange`
  record. The dashboard alert reads *"userId: string → number - 3 files reference this
  endpoint: UsersTable.tsx, Profile.tsx, UserCard.tsx"* instead of a bare diff. See
  `packages/agent/src/proxy/affectedFiles.ts`.
- **Shareable live status badge.** `GET /api/badge/:projectId.svg` on the cloud
  backend renders a real-time SVG ("contracts: stable" green / "2 breaking changes"
  red) with no auth, meant to sit in a project's GitHub README next to the CI badge.
  Every teammate who sees a red badge in a README is a cold lead who didn't come from
  an ad - this is the same PLG loop that made Codecov and Travis badges ubiquitous.
  See `packages/server/src/routes/badge.ts`.
- **AI context brief.** The captured endpoints, recent breaking changes, and
  affected-frontend-file data already power the dashboard and CI comments; the same
  data is also exposed as `schema-watch context` (writes/upserts markdown into
  `CONTEXT.md` or `CLAUDE.md`) and as a local MCP server (`packages/mcp`, additive -
  same underlying data as the CLI, a different shell around it) so a coding agent can
  pull current API state instead of a human re-explaining the codebase every session.
  See `packages/agent/src/context/` and `packages/mcp/src/index.ts`.

Roadmap items worth knowing about but *not* built in this pass (would meaningfully
expand scope): an LLM-generated plain-English blast-radius explanation per breaking
change (Claude API call: "this will break any code doing `parseInt(userId)`"), a GitHub
App that posts inline PR review comments instead of just failing a check, and a
contract-stability trend graph per project. All three slot into the existing schema
without a redesign - `ContractChange.details` (JSONB) already has room for an
`aiExplanation` field, and the badge route is one query away from a trend endpoint.

## 10. What's deliberately NOT in this MVP

- No OAuth (email/password + JWT only) - add providers post-validation.
- No background job queue - Stripe webhooks and Slack fan-out run inline in the
  request handler; move to a queue only once volume demands it.
- No GitHub App / actual PR-comment bot - `/api/ci/check` is built so a GitHub Action
  can call it and exit non-zero, which is the MVP version of "block the PR." A real
  GitHub App (inline PR comments, required-check status) is a natural phase-2 addition
  on top of the same endpoint.
- Extension is a documented stub (`extension/README.md`), not built, per the phased
  plan: prove the core loop locally first.
- `packages/mcp` targets `@modelcontextprotocol/sdk` v1 (stdio transport) on purpose.
  The SDK's `main` branch has already moved to an unreleased v2 split across
  differently-named packages; not worth migrating to until the client ecosystem
  (Claude Code, Cursor, etc.) actually supports it.
