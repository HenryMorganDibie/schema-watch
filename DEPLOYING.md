# Deploying Schema-Watch

Three pieces, and only two of them are hosted:

| Piece | Where | Why |
| --- | --- | --- |
| Local agent + dashboard | **Nowhere. Runs on each developer's machine.** | It proxies the developer's own backend. Hosting it would mean routing customers' private API traffic through your servers. |
| Cloud API (`packages/server`) | Vercel serverless (or Render/Railway) | Needs env vars and a database. |
| Cloud app (`packages/web`) | Vercel or Netlify (static) | Plain SPA, no server needed. |

## 1. Database (done)

Postgres lives on Supabase. Connections go through the **pooler**, not the
direct host: serverless functions open a connection per invocation and would
exhaust a direct connection limit immediately.

- Runtime (`DATABASE_URL`): pooler on port **6543** with `?pgbouncer=true&connection_limit=1`
- Migrations (`DIRECT_URL`): pooler on port **5432** (pgbouncer's transaction
  mode cannot run DDL)

Row Level Security is enabled on every table with **no policies**. That is
deliberate: Supabase exposes a public PostgREST endpoint, and without RLS
anyone holding the project's anon key could read every password hash. The app
never uses that endpoint - Prisma connects as `postgres`, which bypasses RLS -
so locking it down costs nothing and closes the hole.

## 2. Cloud API on Vercel

Import the GitHub repo at <https://vercel.com/new> and set:

| Setting | Value |
| --- | --- |
| Root Directory | `packages/server` |
| Framework Preset | Other |
| Build Command | leave default (uses `vercel-build`) |

Then add these environment variables (Production):

```
DATABASE_URL   postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL     postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
JWT_SECRET     <a long random string; generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
APP_URL        https://<your-frontend-domain>
```

Optional, only if you are taking payments:

```
FLUTTERWAVE_SECRET_KEY     FLWSECK-...
FLUTTERWAVE_WEBHOOK_HASH   <the "Secret hash" you set in the Flutterwave dashboard>
FLUTTERWAVE_PLAN_ID_PRO    <payment plan id>
FLUTTERWAVE_PLAN_ID_TEAM   <payment plan id>
STRIPE_SECRET_KEY          sk_live_...
STRIPE_WEBHOOK_SECRET      whsec_...
STRIPE_PRICE_ID_PRO        price_...
STRIPE_PRICE_ID_TEAM       price_...
```

The API boots fine with no payment keys at all; billing routes return 503 and
everything else works.

Verify with `curl https://<your-api-domain>/api/health` - it should return
`{"ok":true}`.

## 3. Cloud app

Root Directory `packages/web`, and one environment variable:

```
VITE_API_URL   https://<your-api-domain>
```

This is baked in at build time, so changing it needs a redeploy. A
`netlify.toml` is included if you would rather host the app on Netlify; the
API cannot go there, since Netlify only runs serverless functions and this is
a long-lived Fastify process.

## 4. Point the agent at production

In a developer's `schema-watch.config.json`:

```json
"sync": {
  "enabled": true,
  "projectId": "<project id from the dashboard>",
  "apiKey": "sw_live_...",
  "cloudUrl": "https://<your-api-domain>"
}
```

## Serverless caveats

Vercel runs the API as functions, so a cold request adds roughly a second and
connection pooling matters - hence the pgbouncer URL above. If that ever
becomes a problem, moving to Render or Railway is a hosting change, not a
rewrite: `packages/server/src/index.ts` already runs as a normal long-lived
Node process, which is exactly what those platforms expect.
