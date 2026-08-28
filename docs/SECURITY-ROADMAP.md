# Security roadmap

Security is currently **good enough to put in front of people**. It is not
finished. This file exists so that distinction survives past the moment auth
started working.

What is done, and how it was verified, is in [SECURITY.md](../SECURITY.md).

## Before serious public Cloud adoption

Ordered by what actually reduces risk first, not by effort.

| Item | Why it matters | Blocked on |
| --- | --- | --- |
| **Production email verification** | Signups from real users cannot complete today | Custom domain |
| **Secure cookie migration** | Access and refresh tokens sit in `localStorage`, so an XSS reads both | Custom domain: split Vercel domains would force `SameSite=None` and add CSRF surface |
| **CSRF protection** | Only becomes necessary once auth moves to cookies; unnecessary while auth is a bearer token | Cookie migration |
| **OAuth/OIDC with PKCE** | Sign-in friction, and password reuse | GitHub and Google OAuth apps, stable callback URLs |
| **OAuth account-linking protection** | A provider identity must never silently take over an existing account by matching an email | OAuth |
| **Admin re-authentication** | Granting a plan is a money action taken with an ordinary session | Nothing |
| **Audit trail** | No record of who changed a plan, a team membership or an API key | Nothing |
| **Password-reset abuse review** | Rate limits exist; the flow has not been reviewed as an abuse vector end to end | Nothing |
| **Endpoint-by-endpoint audit** | Tenant isolation is tested on the main paths, not exhaustively | Nothing |
| **Session/device revocation UI** | The API exists (`/api/auth/sessions`); no interface uses it | Nothing |
| **MFA architecture** | Not needed at this size; the shape should not be designed out later | Nothing |

## Standing rules

- A new Cloud endpoint is not done until its tenant isolation is tested.
  "User A cannot reach User B's data" is a test, not an assumption.
- Never claim a security property in docs without a verification to point at.
- The local product stays unmetered, and silent by default. Opt-in telemetry
  (added 2026-08-26) is the one exception, and it holds the line: off unless
  switched on, no prompt that defaults to yes, no API data of any kind, and
  `DO_NOT_TRACK` honoured. Anything that would make the OSS tool phone home
  *without being asked* still needs a much better reason than analytics.

## Deliberately not doing yet

Enterprise IAM, SSO, SCIM, fine-grained roles beyond OWNER/ADMIN/MEMBER. None
of these have a user asking for them, and each is easier to design correctly
once someone does.
