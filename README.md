# Schema-Watch

Live API contract monitoring. Point your frontend at a local proxy instead of
your real backend, and the moment a field's type, presence, or nullability
changes you get an alert naming the exact field and which of your own frontend
files reference it.

Full system design, database schema, API surface, and UI architecture are in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## See it working in 30 seconds

```bash
npm install
npm run build
npm run demo
```

Then open **<http://localhost:4561>**.

The demo starts a mock backend serving a stable contract, points the agent at
it, and drives traffic. About ten seconds in, the mock backend "ships a
breaking change" and four alerts land live while you watch:

| Endpoint | Change | Verdict |
| --- | --- | --- |
| `GET /api/users/:id` | `userId` string to number | Breaking, 3 files affected |
| `GET /api/orders/:id` | `total` number to string | Breaking, 2 files affected |
| `GET /api/session` | `user` object to null | Breaking |
| `GET /api/projects` | `items[].archived` added | Safe |

That last row is the point. Values jitter on every single request in the demo
and nothing fires; only real shape changes do. A tool that flags every changed
timestamp is worse than no tool.

## Why it doesn't spam you

It diffs the **shape** of each payload (type, optionality, nullability), never
the values. Severity is context-aware: a new required field is breaking in a
*request* body but harmless in a *response* body, and a response field that
quietly becomes optional is breaking even though nothing was removed.

Those rules are pinned down as executable tests in
[`packages/core/src/diff.test.ts`](./packages/core/src/diff.test.ts) - read that
file to understand the product's behavior faster than reading the code.

## Repo layout

```text
packages/
  core/        schema inference + diff engine (framework-agnostic, unit tested)
  agent/       local reverse proxy + SQLite + REST/WS API + CLI (`schema-watch`)
  ui/          presentational components + design tokens shared by both apps
  dashboard/   local live UI, served by the agent
  web/         cloud app - signup, teams, projects, API keys, billing (Netlify)
  server/      cloud backend - accounts, teams, billing, CI gate, Slack, badge
examples/
  demo/          the one-command demo above
  github-action/ copy-pasteable CI gate workflow
extension/     phase-2 Chrome DevTools panel (design notes only, not built)
```

## Use it on your own project

```bash
cd your-project
node path/to/schema-watch/packages/agent/dist/cli.js init --target http://localhost:3001
node path/to/schema-watch/packages/agent/dist/cli.js start
```

Then change your frontend's API base URL from `http://localhost:3001` to
`http://localhost:4560` and work normally. The dashboard is on
`http://localhost:4561`.

To get the "N files reference this endpoint" feature, set `frontendSrcDir` in
the generated `schema-watch.config.json` to your app's `src/` folder.

For dashboard hot-reload while developing Schema-Watch itself:

```bash
npm run dev:agent       # proxy :4560, API :4561
npm run dev:dashboard   # Vite :5173, proxies /api and /ws to :4561
```

## Cloud backend (optional)

The free tier is fully local and needs no account. The cloud backend adds
history, team dashboards, Slack alerts, the CI gate, and the status badge.

```bash
cp .env.example .env      # JWT_SECRET is the only required value
docker compose up -d      # Postgres on :5433
cd packages/server
npx prisma migrate deploy # applies the committed migration
npm run dev               # API on :4000

# in another terminal, the cloud app:
npm run dev:web           # :5174, proxies /api to :4000
```

Sign up at <http://localhost:5174/signup>, create a team and project, mint an
API key under Team, then enable `sync` in the agent's `schema-watch.config.json`.

### Deploying

The cloud app is a static SPA and ships with a `netlify.toml`: set the base to
`packages/web` and add a `VITE_API_URL` environment variable pointing at the
API. The API itself is a long-running Fastify process and cannot run on
Netlify's serverless model, so host it somewhere that runs Node continuously
(Railway, Render, Fly, a VPS) with a managed Postgres.

### Email

Verification and password reset go through [Resend](https://resend.com). Set
`RESEND_API_KEY`, and `EMAIL_FROM` once a sending domain is verified. With no
key configured the server still runs and logs the link it would have sent, so
the flow stays testable locally.

Tokens are single-use, expire (24 hours for verification, 1 hour for reset),
and only their SHA-256 hash is stored, so a leaked database backup cannot be
used to take over an account. `forgot-password` always reports success, even
for an unknown address, so it cannot be used to discover who has an account.

Unverified users can sign in and look around, but cannot mint API keys or
subscribe until they confirm their address.

### Payments

Both processors are optional and independent; the server boots fine with
neither configured, and `GET /api/billing/providers` reports what a given
deployment can actually collect with.

- **Flutterwave** - NGN and other African currencies, cards, bank transfer,
  USSD. Required if the selling entity is Nigerian, since Stripe does not
  onboard Nigerian businesses.
- **Stripe** - cards/USD internationally.

Plan prices live in [`packages/server/src/lib/pricing.ts`](./packages/server/src/lib/pricing.ts).
That table is a security boundary, not display copy: webhooks check the amount
actually paid against it before granting a plan, and Flutterwave transactions
are re-verified against Flutterwave's API rather than trusted from the webhook
body.

## Blocking a PR when the contract breaks

```bash
# after your integration tests have driven traffic through the proxy
schema-watch export --out contract.json
schema-watch check --contract contract.json   # exits 1 on a breaking change
```

`examples/github-action/schema-watch.yml` is a working workflow. The gate
requires a Pro or Team plan.

## Tests

```bash
npm run test --workspace packages/core
npm run typecheck --workspaces
```

## Status: what is and is not built

**Live:** the app is at <https://schema-watch-web.vercel.app>, the API at
<https://schema-watch-server-sigma.vercel.app>, backed by Postgres on Supabase.

Working and verified end to end:

- Proxy capture, shape inference, diffing, severity rules (13 unit tests)
- Local dashboard: live WebSocket feed, diff viewer, command palette, dark/light
- Affected-file detection
- Cloud app: signup, login, teams, projects, API keys, billing pages. Driven in
  a real browser against the deployed API, not just curl.
- Email verification and password reset, via Resend. Verified against a live
  database: forged tokens rejected, real tokens accepted, replayed tokens
  rejected, and the old password stops working after a reset.
- CI gate: `export` and `check`, verified to exit 1 on a real breaking change.
- Prisma migrations, applied to the production database.

Not built yet, and still needed before this can be sold:

- **Payments are untested against live processors.** The code paths work and
  reject forged webhooks, but no real Flutterwave or Stripe account, payment
  plan, or webhook has been exercised with live credentials. Nobody has been
  charged a real naira or dollar yet, and `/api/billing/providers` currently
  reports both as unconfigured.
- **No custom domain**, so verification email is sent from Resend's shared
  `onboarding@resend.dev`. That only reaches your own address - signups from
  real users will not receive anything until a domain is verified in Resend and
  `EMAIL_FROM` is set.
- **Team invites require the invitee to already have an account** - there is no
  invitation email flow.
- **A password reset does not end existing sessions.** JWTs are stateless and
  last 30 days, so an attacker holding a stolen token keeps it until it expires.
  Closing this needs a token version on the user, checked per request.
- Cold starts on Vercel's serverless functions add roughly a second to the
  first request, which reads as a hang on the signup button.
- Gzip/brotli response bodies pass through correctly but are skipped for
  diffing. Only tested on Windows and Node 24.
