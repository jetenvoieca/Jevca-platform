import { db } from "@/lib/db";
import { fromMinorUnits } from "@/lib/stripe";

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
}

export async function updatePlatformSubscriptionStatus(params: {
  stripeCustomerId: string;
  status: string;
}) {
  await db.artist.updateMany({
    where: { stripeSubscriptionCustomerId: params.stripeCustomerId },
    data: { stripeSubscriptionStatus: params.status },
  });
}
