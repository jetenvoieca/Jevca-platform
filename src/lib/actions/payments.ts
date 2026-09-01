"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { findOrCreateCustomer } from "./customers";
import {
  getStripeClient,
  getPublishableKey,
  toMinorUnits,
  splitIntoInstalments,
  APP_URL,
  type StripeMode,
} from "@/lib/stripe";

// No revalidatePath(`/sites/${siteId}/artworks`) calls in this file
// (2026-08-15 removal) — that route is force-dynamic (never statically
// cached, so there's nothing there for revalidatePath to usefully
// invalidate), and Next.js auto-refreshes the current route for any
// Server Action that revalidates a path currently being viewed,
// regardless of client code. That auto-refresh was the actual cause of
// the Artwork Catalogue scrolling to the top on every sale action —
// PurchasePanel already keeps itself in sync via its own onChanged
// callback, so this revalidation was pure downside. See the matching
// note in lib/actions/artworks.ts.

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
  framed: boolean;
  source: string | null;
  commissionPercent: string | null;
  invoiceNumber: number | null;
  // Part Three (2026-09-01) — see the matching schema.prisma comments.
  stripePaymentLinkUrl: string | null;
  invoiceEmailedAt: string | null;
  invoiceEmailedTo: string | null;
  totalAmount: string;
  currency: string;
  instalmentCount: number | null;
  releaseMessage: string | null;
  releaseTriggerCount: number | null;
  createdAt: string;
  closedAt: string | null;
  payments: PaymentDetail[];
};

// ---------- Shared: resolve which Stripe mode (Test/Live) applies ----------

async function getStripeModeForArtwork(artworkId: string): Promise<StripeMode> {
  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { artist: { select: { stripeMode: true } } },
  });
  return artwork.artist.stripeMode;
}

// ---------- Sale Terms — autosave, no buyer info, ever ----------

// Sale Terms merged into the Presentation tab (2026-08-15) — there's no
// longer a separate "Total price" the person types; the Artwork's own
// price (Artwork.presentationPrice, itself a mirror of Catalogue's
// Offered price as of 2026-08-28) IS the sale total now. totalAmount
// stays in this table only because startPurchase/Purchase still
// snapshot it — kept in sync here rather than making every future
// caller re-derive it.
//
// Release message/trigger count are no longer typed per-artwork
// (2026-08-28 simplification, at the person's request — repeating a
// value that's already set once in Settings → Payment Defaults was
// unnecessary duplication). Every save of this row takes the artist's
// *current* Settings default fresh, so changing that default later
// reaches every artwork's Sale Terms automatically rather than each one
// being frozen at whatever it was when last saved. A specific
// already-started sale can still have its own message edited afterwards
// (PurchasePanel's "Release message for this sale" / updatePurchaseRelease
// below) — that's a different, deliberately-kept feature for
// personalising wording to one particular buyer, not a per-artwork
// default.
export async function saveSaleTerms(artworkId: string, siteId: string, formData: FormData) {
  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";
  const instalmentCount = parseInt((formData.get("instalmentCount") as string) || "5", 10);

  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { presentationPrice: true, artistId: true },
  });
  const totalAmount = artwork.presentationPrice;
  if (!totalAmount) return;

  const artist = await db.artist.findUnique({
    where: { id: artwork.artistId },
    select: { defaultReleaseMessage: true, defaultReleaseTriggerCount: true },
  });
  const releaseMessage = artist?.defaultReleaseMessage ?? null;
  const releaseTriggerCount = artist?.defaultReleaseTriggerCount ?? null;

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
  // Set only when the person actually picked a result from CustomerPicker
  // (2026-08-16) — see the matching note on findOrCreateCustomer for why
  // this has to be authoritative rather than re-matched by email.
  const customerId = (formData.get("customerId") as string)?.trim() || null;

  if (!buyerEmail) return { ok: false, error: "Buyer email is required to start a sale." };

  // Framed/Unframed is no longer a choice at point of sale (2026-08-28)
  // — each Catalogue entry is a single listing with a single price now
  // (see the matching note on Artwork.priceFramed in schema.prisma).
  // Sale Terms' totalAmount is simply the amount, full stop.
  const totalAmount = terms.totalAmount;

  // Customer records added 2026-08-13 — reuses an existing customer for
  // this artist if the email already matches one, otherwise creates a
  // new one. Falls back to the email as the name if none was given,
  // since Customer.name is required but buyerName here isn't.
  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { artistId: true },
  });
  const customer = await findOrCreateCustomer(artwork.artistId, {
    name: buyerName || buyerEmail,
    email: buyerEmail,
    customerId,
  });

  const purchase = await db.purchase.create({
    data: {
      artworkId,
      customerId: customer.id,
      buyerName,
      buyerEmail,
      type,
      source,
      totalAmount,
      currency: terms.currency,
      instalmentCount: type === "INSTALMENTS" ? terms.instalmentCount : null,
      releaseMessage: terms.releaseMessage,
      releaseTriggerCount: terms.releaseTriggerCount,
    },
  });

  return { ok: true, purchaseId: purchase.id };
}

// ---------- Gallery sales — no Stripe involved at all ----------

// Reworked 2026-08-31 to be started only from the Gallery's own
// Consigned Works panel (GalleriesView), never typed from the Artwork
// Catalogue's Payment tab any more — see the matching removal in
// PurchasePanel. The buyer is always the gallery being viewed, so there
// are no separate buyer name/email/address fields here at all: they're
// snapshotted straight from that gallery's own Customer record. This is
// deliberate, not just a shortcut — galleries are often reluctant to
// disclose who the actual end buyer was, and the money is owed by the
// gallery either way, so the "buyer" for this app's purposes always is
// the gallery.
//
// Raises an unpaid invoice for the net amount owed (sale price less
// commission) — the sale stays ACTIVE ("UNPAID" in the UI) until
// markGallerySalePaid is called once the gallery actually pays. `saleDate`
// is when the gallery says it actually sold (can be backdated — galleries
// don't always report a sale immediately), not today's date, so it's
// used as the Purchase's own createdAt rather than defaulting to now.
export async function startGallerySale(
  artworkId: string,
  customerId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE" },
  });
  if (existingActive) {
    return { ok: false, error: "There's already an active sale in progress for this artwork." };
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Gallery not found." };

  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currencyRaw = (formData.get("currency") as string)?.trim().toUpperCase();
  const currency = currencyRaw || "GBP";
  const commissionPercent = (formData.get("commissionPercent") as string)?.trim() || null;
  const saleDateRaw = (formData.get("saleDate") as string)?.trim();

  if (!totalAmount) return { ok: false, error: "The sale price is required." };

  let createdAt: Date | undefined;
  if (saleDateRaw) {
    const parsed = new Date(saleDateRaw);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "That date isn't valid." };
    createdAt = parsed;
  }

  const purchase = await db.purchase.create({
    data: {
      artworkId,
      channel: "GALLERY",
      customerId: customer.id,
      buyerName: customer.name,
      buyerEmail: customer.email,
      buyerAddress: customer.address,
      type: "FULL",
      totalAmount,
      currency,
      commissionPercent,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  return { ok: true, purchaseId: purchase.id };
}

// A persistent, non-expiring Stripe Payment Link (2026-09-01, Part
// Three) for the NET amount a gallery owes on this sale (sale price
// less commission) — deliberately the Payment Links API, not Checkout
// Sessions (used by createPaymentLink below, for a live Stripe-channel
// sale): a gallery invoice can sit unpaid for weeks, and a Checkout
// Session's URL expires within a day or so, whereas a Payment Link is
// meant to be reusable and doesn't expire. Doesn't require the gallery
// to have an email on file — Stripe collects one at checkout if needed.
// Re-uses the same link on every later call rather than creating a new
// one each time "Payment link" is pressed again, so it's stable to
// paste into an already-sent email or invoice.
export async function createGalleryPaymentLink(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { artwork: true },
      relationLoadStrategy: "query",
    });
    if (!purchase) return { ok: false, error: "Sale not found." };
    if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a gallery sale." };

    if (purchase.stripePaymentLinkUrl) {
      return { ok: true, url: purchase.stripePaymentLinkUrl };
    }

    const total = parseFloat(purchase.totalAmount.toString());
    const commissionPercent = purchase.commissionPercent
      ? parseFloat(purchase.commissionPercent.toString())
      : 0;
    const net = total - total * (commissionPercent / 100);

    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);

    const price = await stripe.prices.create({
      unit_amount: toMinorUnits(net),
      currency: purchase.currency.toLowerCase(),
      product_data: { name: `${purchase.artwork.presentationTitle} — commission owed` },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { purchaseId: purchase.id },
    });

    await db.purchase.update({
      where: { id: purchase.id },
      data: { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
    });

    return { ok: true, url: link.url };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// ---------- Past sales — backfilling history, already paid ----------

// A sale that already happened, sometimes years ago, being entered into
// the system for the first time (2026-08-14). Deliberately a single
// step, not "start then mark paid": there's no live payment to collect
// and no invoice to chase — it's already done. Completes the Purchase
// and creates its one Payment (status PAID) immediately, backdated to
// the actual sale date rather than today, so it lands in the right
// month on the Accounts/Consolidated Sales pages and never shows up as
// overdue on the Alerts dashboard.
export async function recordPastSale(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE" },
  });
  if (existingActive) {
    return {
      ok: false,
      error: "There's an active sale in progress for this artwork — resolve that first.",
    };
  }

  const buyerName = (formData.get("buyerName") as string)?.trim() || null;
  const buyerEmail = (formData.get("buyerEmail") as string)?.trim() || null;
  const buyerAddress = (formData.get("buyerAddress") as string)?.trim() || null;
  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";
  const commissionPercent = (formData.get("commissionPercent") as string)?.trim() || null;
  const saleDateRaw = (formData.get("saleDate") as string)?.trim();
  // Defaulted rather than left blank, so these are easy to spot and
  // filter separately from real-time gallery sales later if that's ever
  // useful — the person can still overwrite it with something more
  // specific per sale.
  const source = (formData.get("source") as string)?.trim() || "Historical";
  // See the matching note in startPurchase above (2026-08-16) — this is
  // exactly the path that was creating duplicate blank customers: a
  // picked customer with no email on file couldn't be re-matched by
  // email, so a second record was silently created every time.
  const customerId = (formData.get("customerId") as string)?.trim() || null;

  if (!buyerName) return { ok: false, error: "The buyer/gallery name is required." };
  if (!totalAmount) return { ok: false, error: "The sale price is required." };
  if (!saleDateRaw) return { ok: false, error: "The date it actually sold is required." };
  const saleDate = new Date(saleDateRaw);
  if (Number.isNaN(saleDate.getTime())) return { ok: false, error: "That date isn't valid." };

  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { artistId: true },
  });
  const customer = await findOrCreateCustomer(artwork.artistId, {
    name: buyerName,
    email: buyerEmail,
    address: buyerAddress,
    customerId,
  });

  const total = parseFloat(totalAmount);
  const commissionNum = commissionPercent ? parseFloat(commissionPercent) : 0;
  const net = total - total * (commissionNum / 100);

  const purchase = await db.purchase.create({
    data: {
      artworkId,
      channel: "GALLERY",
      status: "COMPLETED",
      customerId: customer.id,
      buyerName,
      buyerEmail,
      buyerAddress,
      type: "FULL",
      source,
      totalAmount,
      currency,
      commissionPercent,
      createdAt: saleDate,
      closedAt: saleDate,
      payments: {
        create: {
          sequence: 1,
          amount: net,
          currency,
          status: "PAID",
          paidDate: saleDate,
        },
      },
    },
  });

  // Matches what actually recording a live sale means for the artwork —
  // Availability doesn't update itself automatically anywhere else in
  // this app either, so a past sale shouldn't be an exception.
  await db.artwork.update({ where: { id: artworkId }, data: { availability: "SOLD" } });

  revalidatePath(`/accounts/sales`);
  return { ok: true, purchaseId: purchase.id };
}

// A deliberately separate, softer action from forceDeleteCompletedSale
// below — this one only ever removes a sale that was never actually
// paid (mistyped commission, wrong artwork, wrong buyer entirely, an
// accidental Stripe sale started by mistake), not just one that didn't
// go through. Deliberately restricted to sales that were never actually
// paid, regardless of channel (2026-08-13 — originally gallery-only,
// widened at request since the same tidiness need applies to an
// accidental Stripe start too): a completed sale is a real financial
// record and should never simply vanish via this path, even if it later
// turns out to be wrong — see forceDeleteCompletedSale below for that
// separate, more careful case. Cascades to delete any Payment rows too
// (schema-level onDelete: Cascade).
export async function deleteGallerySale(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (purchase.status === "COMPLETED") {
    return {
      ok: false,
      error: "This sale has already been marked paid and can't be deleted — it's a real financial record.",
    };
  }

  await db.purchase.delete({ where: { id: purchaseId } });

  return { ok: true };
}

// A deliberately separate, scarier action from the one above — this is
// the only path that can remove a genuinely completed, paid sale
// (2026-08-13, at the person's explicit request for cleaning up test
// data). There's no per-user role system in this app to gate this by
// "admin only" in code, so the real safeguard is entirely in the UI:
// this is never the default "Delete" button, only a separate,
// clearly-labelled option shown specifically for completed sales, with
// its own stronger confirmation wording.
export async function forceDeleteCompletedSale(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Sale not found." };

  await db.purchase.delete({ where: { id: purchaseId } });

  return { ok: true };
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

  return { ok: true };
}

// The active sale's own, already-started-specific release wording — a
// deliberately kept, separate feature from Sale Terms' defaults above
// (2026-08-28): once a real sale exists, it can still be tweaked to say
// something more personal/specific for this particular buyer, without
// touching the artist's general Settings default that every future
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
    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);
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
    return { ok: false, error: stripeErrorMessage(err) };
  }

  await db.purchase.update({
    where: { id: purchaseId },
    data: { status: "ABANDONED", closedAt: new Date() },
  });

  return { ok: true };
}

// ---------- Shared helpers ----------

async function getOrCreateStripeCustomer(
  stripe: ReturnType<typeof getStripeClient>,
  purchase: {
    id: string;
    stripeCustomerId: string | null;
    buyerName: string | null;
    buyerEmail: string;
  }
) {
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
      relationLoadStrategy: "query",
    });
    if (!purchase) return { ok: false, error: "Purchase not found." };
    if (!purchase.buyerEmail) {
      return { ok: false, error: "This purchase has no buyer email on file." };
    }

    const mode = await getStripeModeForArtwork(artworkId);
    const stripe = getStripeClient(mode);
    const customerId = await getOrCreateStripeCustomer(stripe, {
      ...purchase,
      buyerEmail: purchase.buyerEmail,
    });
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
): Promise<
  { ok: true; clientSecret: string; publishableKey: string } | { ok: false; error: string }
> {
  try {
    const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return { ok: false, error: "Purchase not found." };
    if (!purchase.buyerEmail) {
      return { ok: false, error: "This purchase has no buyer email on file." };
    }

    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);
    const customerId = await getOrCreateStripeCustomer(stripe, {
      ...purchase,
      buyerEmail: purchase.buyerEmail,
    });
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
    return { ok: true, clientSecret: intent.client_secret, publishableKey: getPublishableKey(mode) };
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
    relationLoadStrategy: "query",
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

  const mode = await getStripeModeForArtwork(purchase.artworkId);
  const stripe = getStripeClient(mode);

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
