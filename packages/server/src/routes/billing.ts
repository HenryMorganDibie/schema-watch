import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import {
  FLUTTERWAVE_PLAN_IDS,
  buildTxRef,
  createPaymentLink,
  isFlutterwaveConfigured,
  verifyTransaction,
  verifyWebhookSignature,
} from "../lib/flutterwave.js";
import { requireMembership } from "../lib/membership.js";
import { PLAN_PRICING } from "../lib/pricing.js";
import { prisma } from "../lib/prisma.js";
import { STRIPE_PRICE_IDS, getStripe, isStripeConfigured } from "../lib/stripe.js";
import { requireUser, requireVerifiedEmail } from "../plugins/authenticate.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

type PaidPlan = "PRO" | "TEAM";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  /** Which processors this deployment can actually collect with. */
  app.get("/providers", async () => ({
    stripe: isStripeConfigured(),
    flutterwave: isFlutterwaveConfigured(),
    pricing: PLAN_PRICING,
  }));

  // ---------------------------------------------------------------- Stripe

  app.post<{ Body: { teamId: string; plan: PaidPlan } }>(
    "/stripe/checkout-session",
    { preHandler: [requireUser, requireVerifiedEmail] },
    async (req, reply) => {
      if (!isStripeConfigured()) return reply.code(503).send({ error: "Stripe is not configured on this server" });

      const { teamId, plan } = req.body ?? {};
      const membership = await requireMembership(req.userId!, teamId, ["OWNER"]);
      if (!membership) return reply.code(403).send({ error: "only the team owner can change billing" });

      const priceId = STRIPE_PRICE_IDS[plan];
      if (!priceId) return reply.code(400).send({ error: "unknown plan" });

      const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
      const customerId = team.stripeCustomerId ?? (await createStripeCustomer(team.id, team.name, req.userId!));

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}/billing?success=1`,
        cancel_url: `${APP_URL}/billing?canceled=1`,
        client_reference_id: teamId,
        metadata: { teamId, plan },
      });

      return reply.send({ url: session.url });
    },
  );

  app.post<{ Body: { teamId: string } }>("/stripe/portal-session", { preHandler: requireUser }, async (req, reply) => {
    if (!isStripeConfigured()) return reply.code(503).send({ error: "Stripe is not configured on this server" });

    const { teamId } = req.body ?? {};
    const membership = await requireMembership(req.userId!, teamId, ["OWNER"]);
    if (!membership) return reply.code(403).send({ error: "only the team owner can manage billing" });

    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (!team.stripeCustomerId) return reply.code(400).send({ error: "no billing account yet - upgrade first" });

    const session = await getStripe().billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: `${APP_URL}/billing`,
    });
    return reply.send({ url: session.url });
  });

  // No requireUser here - Stripe calls this directly and authenticates via the
  // webhook signature, verified against the raw body stashed by app.ts.
  app.post("/stripe/webhook", async (req, reply) => {
    if (!isStripeConfigured()) return reply.code(503).send({ error: "Stripe is not configured on this server" });

    const signature = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (typeof signature !== "string" || !secret) {
      return reply.code(400).send({ error: "missing signature" });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.rawBody!, signature, secret);
    } catch (err) {
      return reply.code(400).send({ error: `webhook signature verification failed: ${(err as Error).message}` });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const teamId = session.client_reference_id;
        const plan = session.metadata?.plan as PaidPlan | undefined;
        if (teamId && plan) {
          await prisma.team.update({
            where: { id: teamId },
            data: {
              plan,
              billingProvider: "STRIPE",
              stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripeSubscriptionId:
                typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
            },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.team.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { plan: "FREE", stripeSubscriptionId: null },
        });
        break;
      }
    }

    return reply.send({ received: true });
  });

  // ----------------------------------------------------------- Flutterwave

  app.post<{ Body: { teamId: string; plan: PaidPlan; currency?: string } }>(
    "/flutterwave/checkout",
    { preHandler: [requireUser, requireVerifiedEmail] },
    async (req, reply) => {
      if (!isFlutterwaveConfigured()) {
        return reply.code(503).send({ error: "Flutterwave is not configured on this server" });
      }

      const { teamId, plan, currency } = req.body ?? {};
      const membership = await requireMembership(req.userId!, teamId, ["OWNER"]);
      if (!membership) return reply.code(403).send({ error: "only the team owner can change billing" });

      const pricing = PLAN_PRICING[plan];
      if (!pricing) return reply.code(400).send({ error: "unknown plan" });

      const chosenCurrency = currency ?? pricing.defaultCurrency;
      const amount = pricing.amounts[chosenCurrency];
      if (amount === undefined) {
        return reply.code(400).send({ error: `no configured price for currency ${chosenCurrency}` });
      }

      const [team, user] = await Promise.all([
        prisma.team.findUniqueOrThrow({ where: { id: teamId } }),
        prisma.user.findUniqueOrThrow({ where: { id: req.userId! } }),
      ]);

      const txRef = buildTxRef(team.id);
      const link = await createPaymentLink({
        txRef,
        amount,
        currency: chosenCurrency,
        redirectUrl: `${APP_URL}/billing?provider=flutterwave`,
        customerEmail: user.email,
        customerName: team.name,
        paymentPlanId: FLUTTERWAVE_PLAN_IDS[plan] || undefined,
        meta: { teamId: team.id, plan },
      });

      await prisma.team.update({ where: { id: team.id }, data: { flutterwaveTxRef: txRef } });
      return reply.send({ url: link });
    },
  );

  app.post("/flutterwave/webhook", async (req, reply) => {
    if (!isFlutterwaveConfigured()) {
      return reply.code(503).send({ error: "Flutterwave is not configured on this server" });
    }

    const hash = req.headers["verif-hash"];
    if (!verifyWebhookSignature(typeof hash === "string" ? hash : undefined)) {
      return reply.code(401).send({ error: "invalid webhook signature" });
    }

    const body = req.body as { event?: string; data?: { id?: number; status?: string; meta?: Record<string, string> } };
    const transactionId = body.data?.id;
    if (!transactionId) return reply.send({ received: true });

    // Never trust the webhook body for the amount or status: re-verify with
    // Flutterwave before granting a paid plan.
    let transaction;
    try {
      transaction = await verifyTransaction(transactionId);
    } catch (err) {
      req.log.error({ err }, "flutterwave verification failed");
      return reply.code(400).send({ error: "verification failed" });
    }

    if (transaction.status !== "successful") return reply.send({ received: true });

    const teamId = transaction.meta?.teamId ?? body.data?.meta?.teamId;
    const plan = (transaction.meta?.plan ?? body.data?.meta?.plan) as PaidPlan | undefined;
    if (!teamId || !plan) return reply.send({ received: true });

    const expected = PLAN_PRICING[plan]?.amounts[transaction.currency];
    if (expected === undefined || transaction.amount < expected) {
      req.log.warn({ teamId, plan, paid: transaction.amount }, "underpaid flutterwave transaction ignored");
      return reply.send({ received: true });
    }

    await prisma.team.update({
      where: { id: teamId },
      data: { plan, billingProvider: "FLUTTERWAVE", flutterwaveTxRef: transaction.tx_ref },
    });

    return reply.send({ received: true });
  });
}

async function createStripeCustomer(teamId: string, teamName: string, requestingUserId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: requestingUserId } });
  const customer = await getStripe().customers.create({ name: teamName, email: user.email, metadata: { teamId } });
  await prisma.team.update({ where: { id: teamId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}
