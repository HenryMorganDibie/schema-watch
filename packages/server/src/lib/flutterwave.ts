import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.flutterwave.com/v3";

/**
 * Flutterwave is the primary collection path for NGN and other African
 * currencies, where Stripe cannot onboard the merchant at all. Stripe stays
 * for USD/card-international. Both write to the same Team.plan field, so the
 * rest of the app never has to know which processor took the money.
 */
export function isFlutterwaveConfigured(): boolean {
  return Boolean(process.env.FLUTTERWAVE_SECRET_KEY);
}

function secretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error("Flutterwave is not configured (FLUTTERWAVE_SECRET_KEY is unset)"), {
      statusCode: 503,
    });
  }
  return key;
}

export const FLUTTERWAVE_PLAN_IDS = {
  PRO: process.env.FLUTTERWAVE_PLAN_ID_PRO ?? "",
  TEAM: process.env.FLUTTERWAVE_PLAN_ID_TEAM ?? "",
} as const;

interface CreatePaymentLinkParams {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail: string;
  customerName?: string;
  /** Flutterwave payment plan id - set this to make the charge recurring. */
  paymentPlanId?: string;
  meta?: Record<string, string>;
}

/** Returns the hosted checkout URL the customer should be sent to. */
export async function createPaymentLink(params: CreatePaymentLinkParams): Promise<string> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirectUrl,
      payment_plan: params.paymentPlanId || undefined,
      customer: { email: params.customerEmail, name: params.customerName },
      customizations: { title: "Schema-Watch", description: "API contract monitoring subscription" },
      meta: params.meta,
    }),
  });

  const body = (await res.json()) as { status?: string; message?: string; data?: { link?: string } };
  if (!res.ok || body.status !== "success" || !body.data?.link) {
    throw new Error(`Flutterwave payment link failed: ${body.message ?? res.statusText}`);
  }
  return body.data.link;
}

export interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
  meta?: Record<string, string>;
}

/**
 * Always re-verify server side before granting a plan. Webhook payloads and
 * redirect params are attacker-controllable; this call to Flutterwave is not.
 */
export async function verifyTransaction(transactionId: number | string): Promise<FlutterwaveTransaction> {
  const res = await fetch(`${API_BASE}/transactions/${transactionId}/verify`, {
    headers: { authorization: `Bearer ${secretKey()}` },
  });
  const body = (await res.json()) as { status?: string; message?: string; data?: FlutterwaveTransaction };
  if (!res.ok || body.status !== "success" || !body.data) {
    throw new Error(`Flutterwave verification failed: ${body.message ?? res.statusText}`);
  }
  return body.data;
}

/**
 * Flutterwave signs webhooks by sending the shared secret verbatim in the
 * `verif-hash` header, so this is a constant-time equality check rather than
 * an HMAC comparison like Stripe's.
 */
export function verifyWebhookSignature(receivedHash: string | undefined): boolean {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!expected || !receivedHash) return false;

  const a = Buffer.from(receivedHash);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Stable transaction reference so a retried checkout is traceable to its team. */
export function buildTxRef(teamId: string): string {
  const nonce = createHmac("sha256", teamId).update(String(Date.now())).digest("hex").slice(0, 10);
  return `sw-${teamId}-${nonce}`;
}
