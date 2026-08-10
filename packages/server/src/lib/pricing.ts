/**
 * Single source of truth for what each paid plan costs, per currency.
 *
 * The webhook handlers check the amount actually paid against these numbers
 * before granting a plan, so this table is a security boundary, not just
 * display copy - never derive a granted plan from a client-supplied amount.
 *
 * NGN prices are set independently rather than FX-converted from USD, which
 * is standard for African SaaS pricing (local purchasing power, and it keeps
 * the number stable when the rate moves).
 */
export const PLAN_PRICING = {
  PRO: {
    defaultCurrency: "USD",
    amounts: {
      USD: 12,
      NGN: 12_000,
    } as Record<string, number>,
  },
  TEAM: {
    defaultCurrency: "USD",
    amounts: {
      USD: 30,
      NGN: 30_000,
    } as Record<string, number>,
  },
} as const satisfies Record<string, { defaultCurrency: string; amounts: Record<string, number> }>;

export type PaidPlanName = keyof typeof PLAN_PRICING;
