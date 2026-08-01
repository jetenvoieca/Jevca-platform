"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { stripe, toMinorUnits, splitIntoInstalments, APP_URL } from "@/lib/stripe";

// ---------- Reading ----------

export type PaymentDetail = {
  id: string;
  sequence: number;
  amount: string;
  currency: string;
  status: "DUE" | "PAID" | "FAILED";
  dueDate: string | null;
  paidDate: string | null;
};

export type PaymentPlanDetail = {
  id: string;
  type: "FULL" | "INSTALMENTS";
  totalAmount: string;
  currency: string;
  instalmentCount: number | null;
  releaseMessage: string | null;
  releaseTriggerCount: number | null;
  buyerName: string | null;
  buyerEmail: string | null;
  payments: PaymentDetail[];
};

export async function getPaymentPlan(artworkId: string): Promise<PaymentPlanDetail | null> {
  const plan = await db.paymentPlan.findUnique({
    where: { artworkId },
    include: { payments: { orderBy: { sequence: "asc" } } },
  });
  if (!plan) return null;
  return serializePlan(plan);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePlan(plan: any): PaymentPlanDetail {
  return {
    id: plan.id,
    type: plan.type,
    totalAmount: plan.totalAmount.toString(),
    currency: plan.currency,
    instalmentCount: plan.instalmentCount,
    releaseMessage: plan.releaseMessage,
    releaseTriggerCount: plan.releaseTriggerCount,
    buyerName: plan.buyerName,
    buyerEmail: plan.buyerEmail,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: plan.payments.map((p: any) => ({
      id: p.id,
      sequence: p.sequence,
      amount: p.amount.toString(),
      currency: p.currency,
      status: p.status,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      paidDate: p.paidDate ? p.paidDate.toISOString() : null,
    })),
  };
}

// ---------- Create / update plan terms ----------

// Creates the plan on first save, or updates its terms if called again.
// The panel only shows this form while no payment has been taken yet
// (payments.length === 0) — once a real Stripe Customer/Checkout/
// Subscription exists behind a plan, changing the total or instalment
// count here would no longer match what Stripe actually has on file, so
// the UI locks the terms at that point (see updateReleaseSettings for
// what stays editable afterwards).
export async function savePaymentPlan(artworkId: string, siteId: string, formData: FormData) {
  const type = (formData.get("type") as string) === "INSTALMENTS" ? "INSTALMENTS" : "FULL";
  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";
  const instalmentCountRaw = (formData.get("instalmentCount") as string)?.trim();
  const releaseMessage = (formData.get("releaseMessage") as string)?.trim() || null;
  const releaseTriggerCountRaw = (formData.get("releaseTriggerCount") as string)?.trim();
  const buyerName = (formData.get("buyerName") as string)?.trim() || null;
  const buyerEmail = (formData.get("buyerEmail") as string)?.trim() || null;

  if (!totalAmount) return;

  const instalmentCount =
    type === "INSTALMENTS" ? parseInt(instalmentCountRaw || "5", 10) : null;
  const releaseTriggerCount = releaseTriggerCountRaw ? parseInt(releaseTriggerCountRaw, 10) : null;

  await db.paymentPlan.upsert({
    where: { artworkId },
    create: {
      artworkId,
      type,
      totalAmount,
      currency,
      instalmentCount,
      releaseMessage,
      releaseTriggerCount,
      buyerName,
      buyerEmail,
    },
    update: {
      type,
      totalAmount,
      currency,
      instalmentCount,
      releaseMessage,
      releaseTriggerCount,
      buyerName,
      buyerEmail,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
}

// Editable at any time, even after payment has started — this is
// deliberately separate from savePaymentPlan, which is locked once a real
// payment exists.
export async function updateReleaseSettings(artworkId: string, siteId: string, formData: FormData) {
  const releaseMessage = (formData.get("releaseMessage") as string)?.trim() || null;
  const releaseTriggerCountRaw = (formData.get("releaseTriggerCount") as string)?.trim();

  await db.paymentPlan.update({
    where: { artworkId },
    data: {
      releaseMessage,
      releaseTriggerCount: releaseTriggerCountRaw ? parseInt(releaseTriggerCountRaw, 10) : null,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
}

// The rare "artwork is being sold again after a previous plan fell
// through" case — deliberately manual, not automated (see
// payments-design.md).
export async function deletePaymentPlan(artworkId: string, siteId: string) {
  await db.paymentPlan.delete({ where: { artworkId } }).catch(() => {});
  revalidatePath(`/sites/${siteId}/artworks`);
}

// ---------- Shared helpers ----------

async function getOrCreateStripeCustomer(plan: {
  id: string;
  stripeCustomerId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
}) {
  if (plan.stripeCustomerId) return plan.stripeCustomerId;
  if (!plan.buyerEmail) {
    throw new Error("Add the buyer's email before taking a payment.");
  }

  const customer = await stripe.customers.create({
    email: plan.buyerEmail,
    name: plan.buyerName || undefined,
  });

  await db.paymentPlan.update({ where: { id: plan.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

// The amount charged right now — the first instalment if this is an
// instalment plan, or the full amount otherwise.
function firstChargeAmount(plan: {
  type: string;
  totalAmount: unknown;
  instalmentCount: number | null;
}) {
  const total = parseFloat(plan.totalAmount as string);
  if (plan.type === "INSTALMENTS" && plan.instalmentCount) {
    return splitIntoInstalments(total, plan.instalmentCount)[0];
  }
  return total;
}

// ---------- Take payment: hosted Stripe payment link ----------

export async function createPaymentLink(artworkId: string, siteId: string): Promise<string> {
  const plan = await db.paymentPlan.findUnique({
    where: { artworkId },
    include: { artwork: true },
  });
  if (!plan) throw new Error("Set up the payment terms first.");

  const customerId = await getOrCreateStripeCustomer(plan);
  const amount = firstChargeAmount(plan);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    payment_intent_data: {
      // Saves the card against the Customer so later instalments can be
      // auto-charged with no buyer present — see handleFirstPaymentSucceeded.
      setup_future_usage: "off_session",
      metadata: { planId: plan.id, sequence: "1" },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency.toLowerCase(),
          unit_amount: toMinorUnits(amount),
          product_data: { name: plan.artwork.presentationTitle },
        },
      },
    ],
    success_url: `${APP_URL}/sites/${siteId}/artworks/${artworkId}?payment=success`,
    cancel_url: `${APP_URL}/sites/${siteId}/artworks/${artworkId}?payment=cancelled`,
  });

  await db.paymentPlan.update({
    where: { id: plan.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  if (!session.url) throw new Error("Stripe did not return a payment link.");
  return session.url;
}

// ---------- Take payment: card entered directly in the app ----------

// Returns a PaymentIntent client secret for the StripeCardForm component
// (Stripe Elements) to confirm against — the card details themselves
// never pass through our server.
export async function createCardEntryIntent(artworkId: string, siteId: string): Promise<string> {
  const plan = await db.paymentPlan.findUnique({ where: { artworkId } });
  if (!plan) throw new Error("Set up the payment terms first.");

  const customerId = await getOrCreateStripeCustomer(plan);
  const amount = firstChargeAmount(plan);

  const intent = await stripe.paymentIntents.create({
    amount: toMinorUnits(amount),
    currency: plan.currency.toLowerCase(),
    customer: customerId,
    setup_future_usage: "off_session",
    metadata: { planId: plan.id, sequence: "1", siteId },
  });

  if (!intent.client_secret) throw new Error("Stripe did not return a client secret.");
  return intent.client_secret;
}

// ---------- Webhook-side handlers (called from /api/stripe/webhook) ----------

// Fires once the first payment (Payment Link or in-app card entry)
// actually clears, confirmed by Stripe — never called optimistically from
// the UI. Records Payment #1 as Paid, and — for an instalment plan —
// sets up a Stripe Subscription Schedule to auto-charge the remainder
// monthly against the card just saved on the Customer.
export async function handleFirstPaymentSucceeded(planId: string, stripePaymentIntentId: string) {
  const plan = await db.paymentPlan.findUnique({
    where: { id: planId },
    include: { artwork: true, payments: true },
  });
  if (!plan) return;

  // Idempotent — Stripe can deliver the same webhook event more than once.
  if (plan.payments.some((p) => p.sequence === 1)) return;

  const total = parseFloat(plan.totalAmount.toString());
  const count = plan.type === "INSTALMENTS" && plan.instalmentCount ? plan.instalmentCount : 1;
  const amounts = splitIntoInstalments(total, count);

  await db.payment.create({
    data: {
      planId: plan.id,
      sequence: 1,
      amount: amounts[0],
      currency: plan.currency,
      status: "PAID",
      paidDate: new Date(),
      stripePaymentIntentId,
    },
  });

  if (plan.type !== "INSTALMENTS" || count <= 1) return;

  const remaining = amounts.slice(1);

  // A fresh Product/Price per remaining instalment — lets the final
  // instalment carry the rounding remainder exactly, rather than forcing
  // every instalment to an identical flat amount.
  const product = await stripe.products.create({
    name: `${plan.artwork.presentationTitle} — instalment plan`,
  });

  const phases = [];
  for (const amt of remaining) {
    const price = await stripe.prices.create({
      unit_amount: toMinorUnits(amt),
      currency: plan.currency.toLowerCase(),
      recurring: { interval: "month" },
      product: product.id,
    });
    phases.push({
      items: [{ price: price.id, quantity: 1 }],
      duration: { interval: "month" as const, interval_count: 1 },
    });
  }

  // Starts ~1 month from now (approximated as 30 days) — instalment 1 was
  // already taken above, this schedule only covers what's left.
  const startDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const schedule = await stripe.subscriptionSchedules.create({
    customer: plan.stripeCustomerId!,
    start_date: startDate,
    end_behavior: "cancel",
    phases,
  });

  await db.paymentPlan.update({
    where: { id: plan.id },
    data: { stripeSubscriptionScheduleId: schedule.id },
  });

  // Due-dated rows so the panel shows the full schedule ahead of time —
  // status only ever flips away from DUE via the webhook handlers below,
  // once Stripe confirms the charge actually happened.
  let dueDate = new Date();
  for (let i = 0; i < remaining.length; i++) {
    dueDate = new Date(dueDate);
    dueDate.setMonth(dueDate.getMonth() + 1);
    await db.payment.create({
      data: {
        planId: plan.id,
        sequence: i + 2,
        amount: remaining[i],
        currency: plan.currency,
        status: "DUE",
        dueDate,
      },
    });
  }
}

// The Subscription behind a schedule doesn't exist until start_date
// arrives — this links it back to the plan once Stripe creates it, so
// later invoice events (which only carry a subscription ID) can find the
// right plan.
export async function linkSubscriptionToSchedule(scheduleId: string, subscriptionId: string) {
  await db.paymentPlan.updateMany({
    where: { stripeSubscriptionScheduleId: scheduleId },
    data: { stripeSubscriptionId: subscriptionId },
  });
}

export async function handleInstalmentInvoicePaid(subscriptionId: string, invoiceId: string) {
  const plan = await db.paymentPlan.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!plan) return;
  const next = await db.payment.findFirst({
    where: { planId: plan.id, status: "DUE" },
    orderBy: { sequence: "asc" },
  });
  if (!next) return;
  await db.payment.update({
    where: { id: next.id },
    data: { status: "PAID", paidDate: new Date(), stripeInvoiceId: invoiceId },
  });
}

export async function handleInstalmentInvoiceFailed(subscriptionId: string, invoiceId: string) {
  const plan = await db.paymentPlan.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!plan) return;
  const next = await db.payment.findFirst({
    where: { planId: plan.id, status: "DUE" },
    orderBy: { sequence: "asc" },
  });
  if (!next) return;
  await db.payment.update({
    where: { id: next.id },
    data: { status: "FAILED", stripeInvoiceId: invoiceId },
  });
}
