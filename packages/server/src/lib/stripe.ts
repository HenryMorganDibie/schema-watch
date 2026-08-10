import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Lazily constructed so the server boots without Stripe configured. Billing is
 * optional for local development and for self-hosted free-tier deployments;
 * only the /api/billing routes actually need a key, and they surface a clear
 * 503 instead of taking the whole process down at import time.
 */
export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error("Billing is not configured on this server (STRIPE_SECRET_KEY is unset)"), {
      statusCode: 503,
    });
  }

  client = new Stripe(key);
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const STRIPE_PRICE_IDS = {
  PRO: process.env.STRIPE_PRICE_ID_PRO ?? "",
  TEAM: process.env.STRIPE_PRICE_ID_TEAM ?? "",
} as const;
