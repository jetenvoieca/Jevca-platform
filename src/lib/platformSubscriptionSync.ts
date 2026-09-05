import { db } from "@/lib/db";
import { fromMinorUnits } from "@/lib/stripe";
import { getPlatformStripeClient } from "@/lib/platformStripe";
import { raiseAlertIfNotAlreadyOpen, resolveAlertsOfType } from "@/lib/alerts";

const PAYMENT_FAILED = "SUBSCRIPTION_PAYMENT_FAILED";
const SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED";

// A Stripe invoice being paid, for a subscription customer we recognise
// (i.e. one already manually linked via Artist.stripeSubscriptionCustomerId
// — see 2026-08-13 decision: no auto-matching by email). Silently no-ops
// for a customer ID we don't recognise, since that could just as easily
// be a Stripe test event or a customer not yet linked — not our error to
// surface as a webhook failure.
export async function recordPlatformInvoicePaid(params: {
  stripeCustomerId: string;
  stripeInvoiceId: string;
  amountMinorUnits: number;
  currency: string;
  paidAtUnixSeconds: number;
}) {
  const artist = await db.artist.findUnique({
    where: { stripeSubscriptionCustomerId: params.stripeCustomerId },
    select: { id: true },
  });
  if (!artist) {
    console.warn(
      `Platform Stripe webhook: no artist linked to customer ${params.stripeCustomerId} — ignoring invoice ${params.stripeInvoiceId}.`
    );
    return;
  }

  // Idempotent on stripeInvoiceId (unique) — a re-delivered webhook event
  // (Stripe's own retry behaviour, or a manual resend from the dashboard)
  // must never double-count the same invoice.
  await db.subscriptionPayment.upsert({
    where: { stripeInvoiceId: params.stripeInvoiceId },
    create: {
      artistId: artist.id,
      source: "STRIPE",
      amount: fromMinorUnits(params.amountMinorUnits),
      currency: params.currency.toUpperCase(),
      paidAt: new Date(params.paidAtUnixSeconds * 1000),
      stripeInvoiceId: params.stripeInvoiceId,
    },
    update: {}, // Already recorded — nothing to change.
  });

  // A successful payment clears any open "payment failed" alert for this
  // artist — that's exactly the signal the issue resolved itself.
  await resolveAlertsOfType(artist.id, PAYMENT_FAILED);
}

export async function recordPlatformInvoiceFailed(params: {
  stripeCustomerId: string;
  amountMinorUnits: number;
  currency: string;
}) {
  const artist = await db.artist.findUnique({
    where: { stripeSubscriptionCustomerId: params.stripeCustomerId },
    select: { id: true, name: true },
  });
  if (!artist) {
    console.warn(
      `Platform Stripe webhook: no artist linked to customer ${params.stripeCustomerId} — ignoring failed invoice.`
    );
    return;
  }
  const amount = fromMinorUnits(params.amountMinorUnits);
  await raiseAlertIfNotAlreadyOpen({
    artistId: artist.id,
    type: PAYMENT_FAILED,
    severity: "WARNING",
    message: `${artist.name}: subscription payment of ${params.currency.toUpperCase()} ${amount.toFixed(2)} failed.`,
  });
}

export async function updatePlatformSubscriptionStatus(params: {
  stripeCustomerId: string;
  status: string;
}) {
  const artist = await db.artist.findUnique({
    where: { stripeSubscriptionCustomerId: params.stripeCustomerId },
    select: { id: true, name: true },
  });
  if (!artist) {
    console.warn(
      `Platform Stripe webhook: no artist linked to customer ${params.stripeCustomerId} — ignoring status update.`
    );
    return;
  }

  await db.artist.update({
    where: { id: artist.id },
    data: { stripeSubscriptionStatus: params.status },
  });

  if (params.status === "canceled" || params.status === "unpaid") {
    await raiseAlertIfNotAlreadyOpen({
      artistId: artist.id,
      type: SUBSCRIPTION_CANCELLED,
      severity: "CRITICAL",
      message: `${artist.name}: subscription is now "${params.status}".`,
    });
  } else if (params.status === "active" || params.status === "trialing") {
    // Reactivated — clear any open cancellation alert.
    await resolveAlertsOfType(artist.id, SUBSCRIPTION_CANCELLED);
  }
}

// Asks Stripe directly for paid invoices, independent of webhook delivery
// history entirely — added 2026-08-18 after a real gap: the platform
// webhook was silently failing for a while (first blocked by the login
// wall, then not recognising the newer invoice_payment.paid event once
// that was fixed), and by the time both were corrected, Stripe had
// already marked those deliveries "succeeded" — so the dashboard's own
// per-event Resend was no longer available for them, and this app's own
// logs only ever recorded the event *type*, not enough detail to
// reconstruct what was missed by hand.
//
// Safe to run more than once, and safe to run routinely: reuses the same
// idempotent recordPlatformInvoicePaid as the webhook itself, keyed on
// Stripe's own invoice ID, so an invoice already recorded is silently
// skipped rather than double-counted. Deliberately not on a schedule —
// this is a resync tool for when something's suspected missing, not a
// substitute for the webhook actually working.
export async function backfillMissingSubscriptionPayments(): Promise<{
  checked: number;
  created: number;
}> {
  const client = getPlatformStripeClient();
  let checked = 0;
  let created = 0;
  let startingAfter: string | undefined;

  // Paginates through every paid invoice on the platform account — no
  // date cutoff, since a full resync is exactly the point of this tool
  // and the volume here is small (artist subscriptions, not buyer
  // sales).
  for (;;) {
    const page = await client.invoices.list({
      status: "paid",
      limit: 100,
      starting_after: startingAfter,
    });

    for (const invoice of page.data) {
      checked++;
      if (!invoice.id) continue;

      const existing = await db.subscriptionPayment.findUnique({
        where: { stripeInvoiceId: invoice.id },
        select: { id: true },
      });
      if (existing) continue;

      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) continue;

      const artist = await db.artist.findUnique({
        where: { stripeSubscriptionCustomerId: customerId },
        select: { id: true },
      });
      if (!artist) continue; // Same "not linked" no-op as the webhook — not an error here either.

      await db.subscriptionPayment.create({
        data: {
          artistId: artist.id,
          source: "STRIPE",
          amount: fromMinorUnits(invoice.amount_paid),
          currency: invoice.currency.toUpperCase(),
          paidAt: new Date(
            (invoice.status_transitions?.paid_at || invoice.created) * 1000
          ),
          stripeInvoiceId: invoice.id,
        },
      });
      created++;
    }

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return { checked, created };
}
