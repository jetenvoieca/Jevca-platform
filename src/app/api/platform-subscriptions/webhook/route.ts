import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getPlatformStripeClient, getPlatformStripeWebhookSecret } from "@/lib/platformStripe";
import {
  recordPlatformInvoicePaid,
  updatePlatformSubscriptionStatus,
} from "@/lib/platformSubscriptionSync";

// Raw body required for Stripe signature verification — req.text() reads
// exactly that; no extra route config needed in the App Router.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  const secret = getPlatformStripeWebhookSecret();
  if (!secret) {
    console.error("PLATFORM_STRIPE_WEBHOOK_SECRET not configured — rejecting webhook.");
    return new Response("Webhook not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const client = getPlatformStripeClient();
    event = client.webhooks.constructEvent(body, signature!, secret);
  } catch (err) {
    console.error("Platform Stripe webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }
  console.log("Platform Stripe webhook verified:", event.type);

  try {
    switch (event.type) {
      // A subscription payment (the artist paying us) succeeding —
      // covers both the very first invoice and every renewal after it.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId && invoice.id) {
          await recordPlatformInvoicePaid({
            stripeCustomerId: customerId,
            stripeInvoiceId: invoice.id,
            amountMinorUnits: invoice.amount_paid,
            currency: invoice.currency,
            paidAtUnixSeconds: invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000),
          });
        }
        break;
      }

      // Surfaces the subscription's current state (active / past_due /
      // canceled / etc.) in the Subscription panel, independent of
      // whether any particular invoice succeeded or failed.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        if (customerId) {
          await updatePlatformSubscriptionStatus({
            stripeCustomerId: customerId,
            status: subscription.status,
          });
        }
        break;
      }

      default:
        // Not every event type needs handling — ignored.
        break;
    }
  } catch (err) {
    // Returning an error (rather than swallowing it) tells Stripe to
    // retry — safer for anything that touched the database and might
    // have partially failed.
    console.error("Platform Stripe webhook handler error", err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
