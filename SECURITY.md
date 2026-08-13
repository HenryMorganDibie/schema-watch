# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/HenryMorganDibie/schema-watch/security/advisories/new),
or email henrymorgandibie@gmail.com. Expect an acknowledgement within a few
days.

The rest of this document describes how authentication, tokens and secrets are
handled, and where the known gaps are.

## Passwords

Hashed with bcrypt at cost 12. Signup and reset require 10+ characters with an
uppercase letter, a lowercase letter, a digit and a symbol.

Common passwords are rejected **after stripping symbols and trailing digits**.
Without that step the character-class rules just teach people to write
`Password123!`, which satisfies every rule and is among the most guessed
strings in existence. `Qwerty2024!` and `Welcome123$` are rejected for the same
reason.

**Login is deliberately exempt from the policy.** Tightening the rules later
must never lock out an account created under the old ones.

`packages/server/src/lib/passwordPolicy.ts` is the authority.
`packages/web/src/components/PasswordStrength.tsx` mirrors it so the user sees
the same checklist while typing rather than discovering it from a rejection.

## Email verification and password reset

Tokens are 32 random bytes, and **only their SHA-256 hash is stored**, so a
leaked database backup cannot be used to take over accounts.

- Single-use. Redemption is a conditional update guarded on `usedAt IS NULL`,
  so two concurrent requests cannot both win.
- Expiring: 24 hours for verification, 1 hour for reset.
- Issuing a new token consumes any earlier unused one for the same purpose.
- `forgot-password` always reports success, even for an address with no
  account, so it cannot be used to discover who has registered.
- Completing a reset also marks the address verified, since it proves control
  of the inbox.

Unverified users can sign in and browse, but cannot mint API keys or subscribe.
The gate covers the actions worth abusing without blocking first-run
exploration.

## API keys

Used by CI and the agent's sync mode. Generated as `sw_live_<random>` and
stored as a SHA-256 hash. The plaintext is returned exactly once, at creation.

SHA-256 rather than bcrypt here is deliberate: keys are looked up by exact
value on every request, which needs a deterministic hash. Their entropy comes
from being random, not from a memorised secret.

## Database

Postgres on Supabase. **Row Level Security is enabled on every table with no
policies.** The application reaches the database through Prisma as the
`postgres` role, which bypasses RLS, so this costs nothing functionally while
closing Supabase's public PostgREST endpoint.

Without it, anyone holding the project's anon key could read every password
hash, API key hash and reset token in the database. This was caught by a
Supabase advisor check and verified afterwards with a real insert, select and
delete through Prisma, to prove the app was bypassing RLS rather than being
silently filtered.

## Webhooks

Never trusted from their body alone.

- **Flutterwave** signs with a shared secret in the `verif-hash` header,
  compared in constant time. A valid signature is still not enough: the
  transaction is re-verified against Flutterwave's API, and the amount paid is
  checked against the server-side price table before any plan is granted.
- **Stripe** is verified with `constructEvent` against the raw request bytes,
  which is why the JSON parser stashes `rawBody` rather than re-serialising.

## Known gaps

**A password reset does not end existing sessions.** JWTs are stateless and
last 30 days, so an attacker holding a stolen token keeps access until it
expires, even after the victim resets. Closing this needs a token version on
the user, checked per request. This is the most significant open item.

**No rate limiting.** Login, signup and `forgot-password` can be called as
fast as the network allows. Worth adding before any real traffic.

**No audit log.** Team membership and API key changes are not recorded.
