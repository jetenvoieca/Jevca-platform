import { db } from "@/lib/db";
import { fromMinorUnits } from "@/lib/stripe";

const PAYMENT_FAILED = "SUBSCRIPTION_PAYMENT_FAILED";
const SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED";

async function resolveOpenAlerts(artistId: string, type: string) {
  await db.alertEvent.updateMany({
    where: { artistId, type, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

async function raiseAlertIfNotAlreadyOpen(params: {
  artistId: string;
  type: string;
  severity: "WARNING" | "CRITICAL";
  message: string;
}) {
  const existing = await db.alertEvent.findFirst({
    where: { artistId: params.artistId, type: params.type, resolvedAt: null },
  });
  if (existing) return; // Already flagged — don't spam a fresh row per retry/webhook redelivery.
  await db.alertEvent.create({
    data: {
      artistId: params.artistId,
      type: params.type,
      severity: params.severity,
      message: params.message,
    },
  });
}

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
  await resolveOpenAlerts(artist.id, PAYMENT_FAILED);
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
    await resolveOpenAlerts(artist.id, SUBSCRIPTION_CANCELLED);
  }
}
