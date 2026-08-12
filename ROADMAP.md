# Roadmap

What is shipped, what is next, and what is deliberately not being built.

## Shipped

- Proxy capture, schema inference, shape diffing, severity rules (13 unit tests)
- Local dashboard: live WebSocket feed, diff viewer, command palette, dark/light
- Affected-file detection
- CLI: `init`, `start`, `export`, `check`
- Cloud app: signup, login, teams, projects, API keys, billing pages
- Email verification and password reset
- CI gate that exits non-zero on a breaking change

## Next

**GitHub PR comment bot.** The CI gate already detects breaking changes and
knows which frontend files reference the endpoint. Posting that as a PR review
comment turns a passing/failing check into something a reviewer reads inline,
and something worth sharing:

```
Schema-Watch detected breaking API changes

GET /api/users/:id
- userId: string
+ userId: number

Affected frontend files:
- src/components/UserCard.tsx
- src/pages/Profile.tsx
- src/hooks/useUser.ts
```

**Team invitations by email.** Adding a member currently requires the invitee
to already have an account.

**Session invalidation on password reset.** See SECURITY.md - the most
significant open security item.

**Rate limiting** on login, signup and password reset.

## Known limitations

- Verification email is sent from Resend's shared sender until a domain is
  verified, so it only reaches the account owner's own address. Real signups on
  the hosted app will not receive mail until a domain is configured.
- Payment processors are implemented and reject forged webhooks, but no live
  Flutterwave or Stripe credentials have been exercised. Nobody has been
  charged yet.
- Gzip and brotli response bodies pass through the proxy correctly but are
  skipped for diffing.
- Cold starts on serverless add roughly a second to the first request.
- Tested on Windows and Node 24.

## Deliberately not built

**The local dashboard is never hosted.** It proxies a developer's own backend
on their own machine. Hosting it would mean routing customers' private API
traffic through our servers, which is both a liability and a reason not to
adopt the tool.

**No background job queue.** Webhook handling and Slack fan-out run inline.
Worth revisiting only when volume demands it.

**Chrome DevTools extension** is designed but not built (`extension/README.md`).
The local agent and dashboard prove the core loop first; the extension is a
second client against the same API, not a rewrite.
