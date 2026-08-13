# Billing

## Plans

| | Free | Pro | Team |
| --- | --- | --- | --- |
| Local monitoring | ✅ unlimited endpoints | ✅ | ✅ |
| Cloud history | 7 days, 1 project | unlimited | unlimited |
| Slack / Discord alerts | ❌ | ✅ | ✅ |
| CI gate | ❌ | ✅ | ✅ |
| Team seats, shared dashboards | ❌ | ❌ | ✅ |

`Team.plan` is the single source of truth. Route handlers check it through a
plan guard rather than scattering feature flags.

**The local tool is free forever and needs no account.** Paid tiers exist for
the cloud: history, team dashboards, alerts and the CI gate.

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
