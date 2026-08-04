"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { stripe, toMinorUnits, splitIntoInstalments, APP_URL } from "@/lib/stripe";

// ---------- Types ----------

export type SaleTermsDetail = {
  totalAmount: string;
  currency: string;
  instalmentCount: number;
  releaseMessage: string | null;
  releaseTriggerCount: number | null;
};

export type PaymentDetail = {
  id: string;
  sequence: number;
  amount: string;
  currency: string;
  status: "DUE" | "PAID" | "FAILED";
  dueDate: string | null;
  paidDate: string | null;
};

export type PurchaseDetail = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  channel: "STRIPE" | "GALLERY";
  buyerName: string | null;
  buyerEmail: string | null;
  buyerAddress: string | null;
  type: "FULL" | "INSTALMENTS";
  source: string | null;
  commissionPercent: string | null;
  invoiceNumber: number | null;
  totalAmount: string;
  currency: string;
  instalmentCount: number | null;
  releaseMessage: string | null;
  releaseTriggerCount: number | null;
  createdAt: string;
  closedAt: string | null;
  payments: PaymentDetail[];
};

// ---------- Sale Terms — autosave, no buyer info, ever ----------

export async function saveSaleTerms(artworkId: string, siteId: string, formData: FormData) {
  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";
  const instalmentCount = parseInt((formData.get("instalmentCount") as string) || "5", 10);
  const releaseMessage = (formData.get("releaseMessage") as string)?.trim() || null;
  const releaseTriggerCountRaw = (formData.get("releaseTriggerCount") as string)?.trim();
  const releaseTriggerCount = releaseTriggerCountRaw ? parseInt(releaseTriggerCountRaw, 10) : null;

  if (!totalAmount) return;

  await db.saleTerms.upsert({
    where: { artworkId },
    create: {
      artworkId,
      totalAmount,
      currency,
      instalmentCount,
      releaseMessage,
      releaseTriggerCount,
    },
    update: { totalAmount, currency, instalmentCount, releaseMessage, releaseTriggerCount },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
}

// ---------- Starting a sale — explicit action, not autosaved ----------

// Creates the actual Purchase, snapshotting SaleTerms at this moment.
// Refuses if there's already an ACTIVE purchase for this artwork — only
// one at a time (see schema comment).
export async function startPurchase(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const terms = await db.saleTerms.findUnique({ where: { artworkId } });
  if (!terms) return { ok: false, error: "Set the sale terms first." };

  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE" },
  });
  if (existingActive) {
    return { ok: false, error: "There's already an active sale in progress for this artwork." };
  }

  const buyerName = (formData.get("buyerName") as string)?.trim() || null;
  const buyerEmail = (formData.get("buyerEmail") as string)?.trim();
  const type = (formData.get("type") as string) === "INSTALMENTS" ? "INSTALMENTS" : "FULL";
  const source = (formData.get("source") as string)?.trim() || null;

  if (!buyerEmail) return { ok: false, error: "Buyer email is required to start a sale." };

  const purchase = await db.purchase.create({
    data: {
      artworkId,
      buyerName,
      buyerEmail,
      type,
      source,
      totalAmount: terms.totalAmount,
      currency: terms.currency,
      instalmentCount: type === "INSTALMENTS" ? terms.instalmentCount : null,
      releaseMessage: terms.releaseMessage,
      releaseTriggerCount: terms.releaseTriggerCount,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  return { ok: true, purchaseId: purchase.id };
}

// ---------- Gallery sales — no Stripe involved at all ----------

// Sold through a third party rather than paid online — raises an invoice
// for the net amount owed (sale price less commission), which starts out
// unpaid. Unlike a Stripe sale, the price isn't locked to Sale Terms —
// a gallery sale can be negotiated at a different figure, so it's typed
// in directly here.
export async function startGallerySale(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE" },
  });
  if (existingActive) {
    return { ok: false, error: "There's already an active sale in progress for this artwork." };
  }

  const buyerName = (formData.get("buyerName") as string)?.trim() || null;
  const buyerEmail = (formData.get("buyerEmail") as string)?.trim() || null;
  const buyerAddress = (formData.get("buyerAddress") as string)?.trim() || null;
  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";
  const commissionPercent = (formData.get("commissionPercent") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim() || null;

  if (!buyerName) return { ok: false, error: "The gallery/buyer name is required." };
  if (!totalAmount) return { ok: false, error: "The sale price is required." };

  const purchase = await db.purchase.create({
    data: {
      artworkId,
      channel: "GALLERY",
      buyerName,
      buyerEmail,
      buyerAddress,
      type: "FULL",
      source,
      totalAmount,
      currency,
      commissionPercent,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  return { ok: true, purchaseId: purchase.id };
}

// The manual equivalent of a Stripe webhook confirming payment — you
// click this once the gallery has actually paid (e.g. by bank transfer),
// since nothing in this flow can confirm that automatically.
export async function markGallerySalePaid(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Purchase not found." };
  if (purchase.channel !== "GALLERY") {
    return { ok: false, error: "This isn't a gallery sale." };
  }

  const total = parseFloat(purchase.totalAmount.toString());
  const commissionPercent = purchase.commissionPercent
    ? parseFloat(purchase.commissionPercent.toString())
    : 0;
  const net = total - total * (commissionPercent / 100);

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: 1,
      amount: net,
      currency: purchase.currency,
      status: "PAID",
      paidDate: new Date(),
    },
  });

  await db.purchase.update({
    where: { id: purchaseId },
    data: { status: "COMPLETED", closedAt: new Date() },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  return { ok: true };
}
// wording for this specific buyer. Autosaved (low-stakes, descriptive),
// unlike starting/abandoning the purchase itself.
export async function updatePurchaseRelease(purchaseId: string, siteId: string, formData: FormData) {
  const releaseMessage = (formData.get("releaseMessage") as string)?.trim() || null;
  const releaseTriggerCountRaw = (formData.get("releaseTriggerCount") as string)?.trim();

  await db.purchase.update({
    where: { id: purchaseId },
    data: {
      releaseMessage,
      releaseTriggerCount: releaseTriggerCountRaw ? parseInt(releaseTriggerCountRaw, 10) : null,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
}

// The sale didn't go ahead. Kept as history (status ABANDONED), not
// deleted — SaleTerms is completely untouched, ready for the next buyer.
// If instalments had already started, also cancels the Stripe schedule so
// nothing keeps auto-charging a sale that isn't happening.
export async function abandonPurchase(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Purchase not found." };

  try {
    if (purchase.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(purchase.stripeSubscriptionId);
    } else if (purchase.stripeSubscriptionScheduleId) {
      await stripe.subscriptionSchedules.cancel(purchase.stripeSubscriptionScheduleId);
    }
  } catch (err) {
    // Don't block marking it abandoned locally just because Stripe's side
    // failed to cancel (e.g. it already finished/cancelled) — but the
    // caller should still know, in case it needs a manual check in Stripe.
    await db.purchase.update({
      where: { id: purchaseId },
      data: { status: "ABANDONED", closedAt: new Date() },
    });
    revalidatePath(`/sites/${siteId}/artworks`);
    return { ok: false, error: stripeErrorMessage(err) };
  }

  await db.purchase.update({
    where: { id: purchaseId },
    data: { status: "ABANDONED", closedAt: new Date() },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  return { ok: true };
}

// ---------- Shared helpers ----------

async function getOrCreateStripeCustomer(purchase: {
  id: string;
  stripeCustomerId: string | null;
  buyerName: string | null;
  buyerEmail: string;
}) {
  if (purchase.stripeCustomerId) return purchase.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: purchase.buyerEmail,
    name: purchase.buyerName || undefined,
  });

  await db.purchase.update({
    where: { id: purchase.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// The amount charged right now — the first instalment if this Purchase is
// an instalment sale, or the full amount otherwise.
function firstChargeAmount(purchase: {
  type: string;
  totalAmount: unknown;
  instalmentCount: number | null;
}) {
  const total = parseFloat(purchase.totalAmount as string);
  if (purchase.type === "INSTALMENTS" && purchase.instalmentCount) {
    return splitIntoInstalments(total, purchase.instalmentCount)[0];
  }
  return total;
}

// ---------- Take payment: hosted Stripe payment link ----------

export async function createPaymentLink(
  purchaseId: string,
  siteId: string,
  artworkId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { artwork: true },
    });
    if (!purchase) return { ok: false, error: "Purchase not found." };

    const customerId = await getOrCreateStripeCustomer(purchase);
    const amount = firstChargeAmount(purchase);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { purchaseId: purchase.id, sequence: "1" },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: purchase.currency.toLowerCase(),
            unit_amount: toMinorUnits(amount),
            product_data: { name: purchase.artwork.presentationTitle },
          },
        },
      ],
      success_url: `${APP_URL}/sites/${siteId}/artworks/${artworkId}?payment=success`,
      cancel_url: `${APP_URL}/sites/${siteId}/artworks/${artworkId}?payment=cancelled`,
    });

    await db.purchase.update({
      where: { id: purchase.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    if (!session.url) return { ok: false, error: "Stripe did not return a payment link." };
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// ---------- Take payment: card entered directly in the app ----------

export async function createCardEntryIntent(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  try {
    const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return { ok: false, error: "Purchase not found." };

    const customerId = await getOrCreateStripeCustomer(purchase);
    const amount = firstChargeAmount(purchase);

    const intent = await stripe.paymentIntents.create({
      amount: toMinorUnits(amount),
      currency: purchase.currency.toLowerCase(),
      customer: customerId,
      setup_future_usage: "off_session",
      metadata: { purchaseId: purchase.id, sequence: "1", siteId },
    });

    if (!intent.client_secret) {
      return { ok: false, error: "Stripe did not return a client secret." };
    }
    return { ok: true, clientSecret: intent.client_secret };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

function stripeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong talking to Stripe. Check the Netlify function logs for details.";
}

// ---------- Webhook-side handlers (called from /api/stripe/webhook) ----------

// Marks a Purchase COMPLETED once every one of its Payments is Paid — a
// Full sale completes immediately (one payment); an Instalment sale
// completes once the last one clears.
async function completeIfAllPaid(purchaseId: string) {
  const remaining = await db.payment.count({
    where: { purchaseId, status: { not: "PAID" } },
  });
  if (remaining === 0) {
    await db.purchase.update({
      where: { id: purchaseId },
      data: { status: "COMPLETED", closedAt: new Date() },
    });
  }
}

export async function handleFirstPaymentSucceeded(purchaseId: string, stripePaymentIntentId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: true, payments: true },
  });
  if (!purchase) return;

  // Idempotent — Stripe can deliver the same webhook event more than once.
  if (purchase.payments.some((p) => p.sequence === 1)) return;

  const total = parseFloat(purchase.totalAmount.toString());
  const count = purchase.type === "INSTALMENTS" && purchase.instalmentCount ? purchase.instalmentCount : 1;
  const amounts = splitIntoInstalments(total, count);

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: 1,
      amount: amounts[0],
      currency: purchase.currency,
      status: "PAID",
      paidDate: new Date(),
      stripePaymentIntentId,
    },
  });

  if (purchase.type !== "INSTALMENTS" || count <= 1) {
    await completeIfAllPaid(purchase.id);
    return;
  }

  const remaining = amounts.slice(1);

  const product = await stripe.products.create({
    name: `${purchase.artwork.presentationTitle} — instalment plan`,
  });

  const phases = [];
  for (const amt of remaining) {
    const price = await stripe.prices.create({
      unit_amount: toMinorUnits(amt),
      currency: purchase.currency.toLowerCase(),
      recurring: { interval: "month" },
      product: product.id,
    });
    phases.push({
      items: [{ price: price.id, quantity: 1 }],
      duration: { interval: "month" as const, interval_count: 1 },
    });
  }

  const startDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const schedule = await stripe.subscriptionSchedules.create({
    customer: purchase.stripeCustomerId!,
    start_date: startDate,
    end_behavior: "cancel",
    phases,
  });

  await db.purchase.update({
    where: { id: purchase.id },
    data: { stripeSubscriptionScheduleId: schedule.id },
  });

  let dueDate = new Date();
  for (let i = 0; i < remaining.length; i++) {
    dueDate = new Date(dueDate);
    dueDate.setMonth(dueDate.getMonth() + 1);
    await db.payment.create({
      data: {
        purchaseId: purchase.id,
        sequence: i + 2,
        amount: remaining[i],
        currency: purchase.currency,
        status: "DUE",
        dueDate,
      },
    });
  }
}

export async function linkSubscriptionToSchedule(scheduleId: string, subscriptionId: string) {
  await db.purchase.updateMany({
    where: { stripeSubscriptionScheduleId: scheduleId },
    data: { stripeSubscriptionId: subscriptionId },
  });
}

export async function handleInstalmentInvoicePaid(subscriptionId: string, invoiceId: string) {
  const purchase = await db.purchase.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!purchase) return;
  const next = await db.payment.findFirst({
    where: { purchaseId: purchase.id, status: "DUE" },
    orderBy: { sequence: "asc" },
  });
  if (!next) return;
  await db.payment.update({
    where: { id: next.id },
    data: { status: "PAID", paidDate: new Date(), stripeInvoiceId: invoiceId },
  });
  await completeIfAllPaid(purchase.id);
}

export async function handleInstalmentInvoiceFailed(subscriptionId: string, invoiceId: string) {
  const purchase = await db.purchase.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!purchase) return;
  const next = await db.payment.findFirst({
    where: { purchaseId: purchase.id, status: "DUE" },
    orderBy: { sequence: "asc" },
  });
  if (!next) return;
  await db.payment.update({
    where: { id: next.id },
    data: { status: "FAILED", stripeInvoiceId: invoiceId },
  });
}
