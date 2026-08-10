# Schema-Watch

Live API contract monitoring. Point your frontend's dev server at a local
proxy instead of your real backend; the moment a field's type, presence, or
nullability changes, you get a dashboard alert that names the exact field -
and which of your own frontend files reference it.

Full system design, database schema, API surface, and UI architecture are in
[`ARCHITECTURE.md`](./ARCHITECTURE.md). This file is just "how do I run it."

## Repo layout

```text
packages/
  core/        schema inference + diff engine (framework-agnostic, unit tested)
  agent/       local reverse proxy + SQLite + REST/WS API + CLI (`schema-watch`)
  dashboard/   React + Vite live UI, served by the agent
  server/      cloud backend - accounts, teams, billing, CI gate, Slack, badge
examples/      copy-pasteable GitHub Action for the CI gate
extension/     phase-2 Chrome DevTools panel (design notes only, not built)
```

## Why it doesn't spam you

It diffs the *shape* of each payload (type, optionality, nullability), not the
values. A response whose `createdAt` changes every request never fires an
alert; a response whose `userId` goes `string` to `number` fires immediately.
That distinction is the whole product, and it's pinned down by the tests in
`packages/core/src/diff.test.ts`.

## Run it locally (free tier - no account, no cloud)

```bash
npm install
npm run build --workspace packages/core   # dashboard/agent import its compiled types

# Point it at whatever backend your frontend normally talks to:
cd packages/agent
node dist/cli.js init --target http://localhost:3001
node dist/cli.js start
```

This starts:

- the proxy on `http://localhost:4560` - point your frontend's API base URL here instead of `http://localhost:3001`
- the dashboard + API on `http://localhost:4561`

For dashboard hot-reload during development, run the agent (above) and the
Vite dev server side by side:

```bash
npm run dev:agent       # from repo root - proxy :4560, API :4561
npm run dev:dashboard   # repo root - Vite :5173, proxies /api and /ws to :4561
```

Open `http://localhost:5173`, hit `⌘K` to jump to any endpoint, and use your
app through the proxy as normal. Nothing shows up until a contract actually
changes - flip a field's type in your backend's mock data to see it fire.

To get the "N files reference this endpoint" feature, add `frontendSrcDir` to
`schema-watch.config.json` pointing at your app's `src/` folder.

## Run the cloud backend (Pro/Team features)

```bash
cp .env.example .env   # fill in JWT_SECRET at minimum; Stripe keys only needed for billing
docker compose up -d   # local Postgres
cd packages/server
npm run db:migrate
npm run dev             # listens on :4000
```

Then in the agent's `schema-watch.config.json`, set `sync.enabled: true` with
an API key minted via `POST /api/teams/:teamId/api-keys` (after signing up
through `/api/auth/signup` and creating a team).

## Tests

```bash
npm run test --workspace packages/core
```

The diff engine's rules (what counts as breaking vs. safe, and why it differs
between request and response bodies) are documented as executable tests in
`packages/core/src/diff.test.ts` - read that file if you want to understand
the product's actual behavior faster than reading the implementation.
