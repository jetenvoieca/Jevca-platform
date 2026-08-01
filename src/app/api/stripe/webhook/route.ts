import { NextRequest } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  handleFirstPaymentSucceeded,
  linkSubscriptionToSchedule,
  handleInstalmentInvoicePaid,
  handleInstalmentInvoiceFailed,
} from "@/lib/actions/payments";

// Extracts the subscription ID from an Invoice, handling both API shapes:
// old (`invoice.subscription`, versions before 2025-03-31) and new
// (`invoice.parent.subscription_details.subscription`, 2025-03-31+).
// Deliberately defensive — the actual payload shape is decided by the API
// version pinned on the Stripe webhook *destination* itself (Stripe
// dashboard → Webhooks), which can drift out of sync with the SDK version
// this code was written against without anyone noticing until an event
// silently fails to match. Belt and braces rather than assuming they'll
// always be kept in step.
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details;
  const nested = subDetails?.subscription;
  if (nested) return typeof nested === "string" ? nested : nested.id;

  // Older API versions (pre 2025-03-31) carried this directly on the
  // invoice — not in the current SDK's types, hence the cast.
  const legacy = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;

  return null;
}

// Stripe requires the raw, unparsed request body to verify a webhook's
// signature — req.text() below reads exactly that, so no extra route
// config is needed in the App Router (unlike the old Pages Router, which
// needed bodyParser explicitly disabled).
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires for BOTH collection routes — a hosted Payment Link and an
      // in-app Stripe Elements card entry both end in a PaymentIntent
      // succeeding, so this one handler covers the first payment either way.
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const planId = intent.metadata?.planId;
        if (planId) {
          await handleFirstPaymentSucceeded(planId, intent.id);
        }
        break;
      }

      // The Subscription behind an instalment schedule is only created
      // once its start_date arrives — this is how we learn its ID.
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const scheduleId =
          typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id;
        if (scheduleId) {
          await linkSubscriptionToSchedule(scheduleId, subscription.id);
        }
        break;
      }

      // A recurring instalment charge succeeding.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = extractInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await handleInstalmentInvoicePaid(subscriptionId, invoice.id!);
        }
        break;
      }

      // A recurring instalment charge failing (Stripe's own Smart Retries
      // will keep trying automatically — this just reflects the failure
      // in the panel so it's visible without waiting on the retry).
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = extractInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await handleInstalmentInvoiceFailed(subscriptionId, invoice.id!);
        }
        break;
      }

      default:
        // Not every event type needs handling — Stripe sends everything
        // the account is subscribed to; unhandled ones are ignored.
        break;
    }
  } catch (err) {
    // Log but still return 200 below where possible is tempting, but
    // returning an error tells Stripe to retry — safer for anything that
    // touched the database and might have partially failed.
    console.error("Stripe webhook handler error", err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
