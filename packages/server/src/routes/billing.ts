import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { requireMembership } from "../lib/membership.js";
import { prisma } from "../lib/prisma.js";
import { STRIPE_PRICE_IDS, stripe } from "../lib/stripe.js";
import { requireUser } from "../plugins/authenticate.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { teamId: string; plan: "PRO" | "TEAM" } }>(
    "/checkout-session",
    { preHandler: requireUser },
    async (req, reply) => {
      const { teamId, plan } = req.body ?? {};
      const membership = await requireMembership(req.userId!, teamId, ["OWNER"]);
      if (!membership) return reply.code(403).send({ error: "only the team owner can change billing" });

      const priceId = STRIPE_PRICE_IDS[plan];
      if (!priceId) return reply.code(400).send({ error: "unknown plan" });

      const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
      const customerId = team.stripeCustomerId ?? (await createStripeCustomer(team.id, team.name, req.userId!));

      const session = await stripe.checkout.sessions.create({
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

  app.post<{ Body: { teamId: string } }>("/portal-session", { preHandler: requireUser }, async (req, reply) => {
    const { teamId } = req.body ?? {};
    const membership = await requireMembership(req.userId!, teamId, ["OWNER"]);
    if (!membership) return reply.code(403).send({ error: "only the team owner can manage billing" });

    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (!team.stripeCustomerId) return reply.code(400).send({ error: "no billing account yet - upgrade first" });

    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: `${APP_URL}/billing`,
    });
    return reply.send({ url: session.url });
  });

  // No requireUser here - Stripe calls this directly and authenticates via
  // the webhook signature instead, verified against the raw request body
  // stashed by the content-type parser registered in app.ts.
  app.post("/webhook", async (req, reply) => {
    const signature = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (typeof signature !== "string" || !secret) {
      return reply.code(400).send({ error: "missing signature" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody!, signature, secret);
    } catch (err) {
      return reply.code(400).send({ error: `webhook signature verification failed: ${(err as Error).message}` });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const teamId = session.client_reference_id;
        const plan = session.metadata?.plan as "PRO" | "TEAM" | undefined;
        if (teamId && plan) {
          await prisma.team.update({
            where: { id: teamId },
            data: {
              plan,
              stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
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
}

async function createStripeCustomer(teamId: string, teamName: string, requestingUserId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: requestingUserId } });
  const customer = await stripe.customers.create({ name: teamName, email: user.email, metadata: { teamId } });
  await prisma.team.update({ where: { id: teamId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}
