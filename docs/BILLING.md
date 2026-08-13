# Billing

## What is free, and why

Detection is free and stays free: the proxy, the dashboard, shape diffing,
affected-file detection, and the CI check including PR comments, check runs
and SARIF. All of it runs with no account.

That is deliberate. Every repository running the check is distribution, and
goodwill lost by crippling the open-source build is much harder to recover
than a limit is to introduce later.

The paid tiers sell what is genuinely painful to run yourself: centralised
data across repositories, hosted integrations, and team coordination.

| | Free | Pro $12/mo | Team $29/user/mo |
| --- | --- | --- | --- |
| Local monitoring and dashboard | ✅ | ✅ | ✅ |
| CI check, PR comment, SARIF | ✅ | ✅ | ✅ |
| Hosted history and schema timeline | ❌ | ✅ | ✅ |
| Slack / Discord alerts | ❌ | ✅ | ✅ |
| Cloud sync across machines | ❌ | ✅ | ✅ |
| GitHub App, inline PR reviews | ❌ | ❌ | ✅ |
| Cross-repository impact analysis | ❌ | ❌ | ✅ |
| Org policies, managed required checks | ❌ | ❌ | ✅ |
| Roles and audit logs | ❌ | ❌ | ✅ |

`Team.plan` is the single source of truth. Route handlers check it through a
plan guard rather than scattering feature flags.

**`POST /api/ci/check` is deliberately available on every plan**, including
free.

## Processors

Both are optional and independent. The server boots with neither configured,
and `GET /api/billing/providers` reports what a given deployment can actually
collect with, so the frontend never offers a payment method that cannot work.

- **Flutterwave** - NGN and other African currencies, cards, bank transfer,
  USSD. Required if the selling entity is Nigerian, since Stripe does not
  onboard Nigerian businesses.
- **Stripe** - cards and USD internationally.

Both write to the same `Team.plan`, so nothing downstream knows or cares which
processor took the money.

## Prices are a security boundary

Plan prices live in
[`packages/server/src/lib/pricing.ts`](../packages/server/src/lib/pricing.ts).
That table is not display copy: the webhook handlers compare the amount
actually paid against it before granting a plan, and reject underpayment.

A plan is never derived from a client-supplied amount.

NGN prices are set independently rather than converted from USD. That is normal
for African SaaS pricing, and it keeps the number stable when the rate moves.

## Fees to expect (Nigeria, via Flutterwave)

Connecting costs nothing: no setup fee, no monthly fee.

| Item | Rate |
| --- | --- |
| Local NGN cards | 1.4% |
| International cards | 3.8% |
| VAT on the fee | +7.5% |
| Stamp duty (over ₦10,000) | ₦50 |

On a ₦12,000/month Pro plan that is roughly ₦230 total, netting about ₦11,770.

**The real gate is paperwork, not money.** Flutterwave holds new accounts in
test mode until you submit CAC business registration (the name must match your
bank account), BVN, NIN, and a recent utility bill or tenancy agreement. No
real payment can be received before that.

## Bank transfer and the operator console

Before a processor is live, payment can be taken by bank transfer. Set the
`BANK_TRANSFER_*` variables and the details appear on the billing page; leave
them unset and the section is hidden entirely.

The customer transfers, emails proof with their team name, and the plan is
granted from **/admin**, which is visible only to emails listed in
`PLATFORM_ADMIN_EMAILS`. Grants are recorded with `billingProvider = MANUAL`,
so a hand-upgraded team is never mistaken for one that paid a processor.

Admin membership is read from the environment rather than a database column
on purpose: nothing that can write to the database can promote itself. Anyone
not on the list gets a 404 from the admin routes, so their existence is not
advertised.

Never commit real account details. This repository is public, and anything
committed to git is published permanently.

## Environment variables

```
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_WEBHOOK_HASH     the "Secret hash" set in the Flutterwave dashboard
FLUTTERWAVE_PLAN_ID_PRO
FLUTTERWAVE_PLAN_ID_TEAM

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_PRO
STRIPE_PRICE_ID_TEAM
```

Billing routes return 503 rather than crashing when their processor is
unconfigured, so a deployment without payments still runs everything else.
