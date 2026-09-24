"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { findOrCreateCustomer } from "./customers";
import { netOwed, saleBreakdown, saleTitle, splitIntoInstalments } from "@/lib/saleMath";
import {
  getStripeModeForArtwork,
  retireGalleryPaymentLinks,
  deactivatePaymentLink,
} from "@/lib/paymentLinks";
import {
  getStripeClient,
  getPublishableKey,
  toMinorUnits,
  fromMinorUnits,
  APP_URL,
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

export type PaymentDetail = {
  id: string;
  sequence: number;
  amount: string;
  currency: string;
  status: "DUE" | "PAID" | "FAILED";
  dueDate: string | null;
  paidDate: string | null;
  // Only ever set for a GALLERY-channel sale's payment, chosen from
  // Artist.paymentMethods at the moment it's marked paid (2026-09-03) —
  // see recordGalleryPayment below. Null for Stripe-channel payments and
  // for anything paid before this existed.
  method: string | null;
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
  // A framing/delivery charge sale arranged after this artwork's sale
  // was paid (2026-09-23) — see Purchase.parentPurchaseId in
  // schema.prisma. Both null for an ordinary sale. `charges` lists an
  // ordinary sale's own charge sales (always empty on a charge itself).
  parentPurchaseId: string | null;
  chargeKind: "FRAMING" | "DELIVERY" | null;
  charges: PurchaseDetail[];
  // Money already collected at the moment the sale was recorded
  // (2026-09-22) — only ever set for an Own-location sale. See the
  // matching note on Purchase.depositPaid in schema.prisma.
  depositPaid: string | null;
  // Framing / delivery (2026-09-23) — at most one of each; costs add to
  // Net Due. See Purchase.framer in schema.prisma.
  framer: string | null;
  framingCost: string | null;
  courier: string | null;
  deliveryCost: string | null;
  invoiceNumber: number | null;
  // Part Three (2026-09-01) — see the matching schema.prisma comments.
  stripePaymentLinkUrl: string | null;
  // Instalment-plan payment link (2026-09-23) — see the matching
  // schema.prisma comment.
  stripeInstalmentLinkUrl: string | null;
  stripeInstalmentLinkCount: number | null;
  invoiceEmailedAt: string | null;
  invoiceEmailedTo: string | null;
  // Receipt sent-log (2026-09-23) — see Purchase.receiptEmailedAt.
  receiptEmailedAt: string | null;
  receiptEmailedTo: string | null;
  // Certificate of Authenticity sent-log (2026-09-03) — same simple
  // current-status pattern as invoiceEmailedAt/invoiceEmailedTo above.
  certificateEmailedAt: string | null;
  certificateEmailedTo: string | null;
  totalAmount: string;
  currency: string;
  instalmentCount: number | null;
  releaseMessage: string | null;
  releaseTriggerCount: number | null;
  createdAt: string;
  closedAt: string | null;
  payments: PaymentDetail[];
};

// ---------- The Availability model (2026-09-20 rebuild; extended 2026-09-22) ----------
//
// Rebuilt from scratch at Craig's explicit request, replacing several
// earlier, increasingly-tangled attempts that kept producing confusing
// edge cases (a payment panel reopening after a sale had already
// completed; closing that panel looking exactly like abandoning a real,
// paid sale). Exactly three states, and (as of the original rebuild)
// three rules for moving between them:
//
//   AVAILABLE  — nothing started.
//   RESERVED   — "Sold - Not Paid" in the UI. A real, named Purchase now
//                exists for this artwork — a payment link has been
//                created, or a card is being entered — just not paid
//                yet.
//   SOLD       — money has actually been taken or logged: a card
//                payment confirmed, a Record sale form submitted, or a
//                gallery invoice marked paid.
//
// The three original commit points, for a direct sale (since
// 2026-09-23 started only from the Studio app — see studioSales.ts):
//   1. Card entry started                        → RESERVED immediately;
//      → payment succeeds                       → SOLD
//   2. Record sale submitted                     → SOLD (already a
//                                                   single atomic step)
//   3. Payment link generated                    → RESERVED
//
// A FOURTH commit point, added 2026-09-22 for Consigned Works (a
// Gallery or Own Location's "Record Sale" form — startGallerySale
// below): the artist explicitly said the sale is done — who bought it,
// for how much, any commission/deposit — the moment that form is
// submitted, even though the money itself (the Net Due balance) is
// usually collected afterwards, as a separate step (Send invoice/
// Record Payment/Payment link — see GallerySaleCard's "consigned"
// layout). So this now goes straight to SOLD too, the same single
// atomic step as rule 2, NOT to RESERVED — recording a sale is itself
// the commit, regardless of whether it's been paid yet. Net Due (via
// netOwed(), lib/saleMath.ts) is what actually tracks the outstanding
// balance from here on; Purchase.status stays ACTIVE ("UNPAID" in the
// UI) until the balance is fully paid (completeIfSettled).
//
// Once RESERVED or SOLD, the Artwork Catalogue shows the status as
// plain text only; the sale itself is managed or cancelled from its
// Location or the Sales page, never from the Catalogue.

// Refuses to start a second sale once the artwork is RESERVED or SOLD —
// used by every way a sale can begin (startPurchase, startGallerySale,
// recordPastSale).
async function assertArtworkAvailableForSale(artworkId: string): Promise<string | null> {
  const artwork = await db.artwork.findUnique({
    where: { id: artworkId },
    select: { availability: true },
  });
  if (artwork?.availability === "SOLD" || artwork?.availability === "RESERVED") {
    return "This artwork already has a sale in progress or completed — manage it from the Sales page first.";
  }
  return null;
}

// Reverts Availability back to AVAILABLE once nothing is left holding
// the artwork RESERVED/SOLD — a sale cancelled (abandonPurchase), an
// unpaid one deleted (deleteGallerySale), or a paid one force-deleted
// (forceDeleteCompletedSale). Only resets when no ACTIVE or COMPLETED
// Purchase remains for this artwork — the normal case is exactly one,
// but this stays correct even if more than one somehow exists. A
// framing/delivery charge sale never holds the artwork on its own.
async function resetAvailabilityIfNothingSoldOrActive(artworkId: string) {
  const stillHeld = await db.purchase.findFirst({
    where: { artworkId, status: { in: ["COMPLETED", "ACTIVE"] }, parentPurchaseId: null },
  });
  if (!stillHeld) {
    await db.artwork.update({ where: { id: artworkId }, data: { availability: "AVAILABLE" } });
  }
}

// ---------- Sale Terms ----------

// Seeds/refreshes SaleTerms straight from the price being charged
// (2026-09-10), right before startPurchase snapshots it — so instalment
// splitting, webhooks, invoices and everything else downstream work on
// a totalAmount that's correct for what was agreed, less any Deposit
// paid noted.
//
// The price is the artwork's own Offered price, unless the caller passes
// a `price` of its own (2026-09-21) — the Studio app lets the artist
// adjust the price on the spot.
//
// Deposit paid isn't recorded as its own Payment row (direct instruction,
// 2026-09-10 — "no deposit handling needed yet, just wire the remaining
// flow") — it only reduces the amount Stripe is asked to collect here.
// Unrelated to Purchase.depositPaid (2026-09-22) — that field is
// specific to a Consigned Works "Record Sale" (a Gallery/Own Location's
// startGallerySale below), a different flow from this one (a direct
// Stripe sale from the Studio app).
async function seedSaleTerms(
  artworkId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const artwork = await db.artwork.findUnique({
    where: { id: artworkId },
    select: { offeredPrice: true, artistId: true },
  });
  if (!artwork) return { ok: false, error: "Artwork not found." };

  const priceRaw =
    (formData.get("price") as string)?.trim() || artwork.offeredPrice?.toString();
  if (!priceRaw) {
    return { ok: false, error: "Set an Offered price on the Catalogue tab first." };
  }

  const depositRaw = (formData.get("depositPaid") as string)?.trim();
  const deposit = depositRaw ? parseFloat(depositRaw) : 0;
  const offered = parseFloat(priceRaw);
  const remaining = Math.max(offered - (Number.isFinite(deposit) ? deposit : 0), 0);
  if (remaining <= 0) {
    return { ok: false, error: "Nothing left to charge after the deposit already noted." };
  }

  const currency = (formData.get("currency") as string)?.trim().toUpperCase() || "GBP";

  const artist = await db.artist.findUnique({
    where: { id: artwork.artistId },
    select: {
      defaultInstalmentCount: true,
      defaultReleaseMessage: true,
      defaultReleaseTriggerCount: true,
    },
  });
  const instalmentCount = artist?.defaultInstalmentCount || 1;
  const releaseMessage = artist?.defaultReleaseMessage ?? null;
  const releaseTriggerCount = artist?.defaultReleaseTriggerCount ?? null;

  await db.saleTerms.upsert({
    where: { artworkId },
    create: {
      artworkId,
      totalAmount: remaining.toFixed(2),
      currency,
      instalmentCount,
      releaseMessage,
      releaseTriggerCount,
    },
    update: {
      totalAmount: remaining.toFixed(2),
      currency,
      instalmentCount,
      releaseMessage,
      releaseTriggerCount,
    },
  });

  return { ok: true };
}

// ---------- Starting a sale — explicit action, not autosaved ----------

// Creates the actual Purchase, snapshotting SaleTerms at this moment.
// Refuses if there's already an ACTIVE purchase for this artwork, or if
// the artwork is already RESERVED/SOLD. Does NOT touch Availability
// itself (2026-09-20 rebuild) — that's the caller's job, so each of
// startArtworkSaleAndGetLink and startArtworkSaleAndEnterCard marks
// RESERVED right after this succeeds. See the file-level note above.
async function startPurchase(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const soldError = await assertArtworkAvailableForSale(artworkId);
  if (soldError) return { ok: false, error: soldError };

  const terms = await db.saleTerms.findUnique({ where: { artworkId } });
  if (!terms) return { ok: false, error: "Set the sale terms first." };

  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE", parentPurchaseId: null },
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

// ---------- Direct Stripe sales, started from the Studio app ----------

// Payment link (rule 3 above): once the Purchase itself is
// successfully started, this marks the artwork RESERVED ("Sold - Not
// Paid") immediately — before attempting to actually generate the
// Stripe link — so the reservation holds even if link-creation itself
// then fails; the Purchase already exists and can be retried from the
// Sales page either way.
export async function startArtworkSaleAndGetLink(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string; url: string } | { ok: false; error: string }> {
  const seeded = await seedSaleTerms(artworkId, formData);
  if (!seeded.ok) return seeded;

  const started = await startPurchase(artworkId, siteId, formData);
  if (!started.ok) return started;

  await db.artwork.update({ where: { id: artworkId }, data: { availability: "RESERVED" } });

  const link = await createPaymentLink(started.purchaseId, siteId, artworkId);
  if (!link.ok) return { ok: false, error: link.error };

  return { ok: true, purchaseId: started.purchaseId, url: link.url };
}

// Card payment (rule 1 above): marks RESERVED the moment the
// Purchase itself is started — the same instant as the payment link
// above, before the card form has even loaded — rather than waiting
// for the payment to actually succeed. SOLD only happens later, once
// the card payment genuinely confirms (handleFirstPaymentSucceeded/
// completeIfSettled, reached via the Stripe webhook or the direct
// client-side confirmation call — see StripeCardForm). See the
// file-level note above for why RESERVED happens this early rather than
// only on success.
export async function startArtworkSaleAndEnterCard(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<
  | { ok: true; purchaseId: string; clientSecret: string; publishableKey: string }
  | { ok: false; error: string }
> {
  const seeded = await seedSaleTerms(artworkId, formData);
  if (!seeded.ok) return seeded;

  const started = await startPurchase(artworkId, siteId, formData);
  if (!started.ok) return started;

  await db.artwork.update({ where: { id: artworkId }, data: { availability: "RESERVED" } });

  const card = await createCardEntryIntent(started.purchaseId, siteId);
  if (!card.ok) return { ok: false, error: card.error };

  return {
    ok: true,
    purchaseId: started.purchaseId,
    clientSecret: card.clientSecret,
    publishableKey: card.publishableKey,
  };
}

// ---------- Gallery sales — no Stripe involved at all ----------

// Reworked 2026-08-31 to be started only from the Location's own
// Consigned Works panel (GalleriesView), never typed from the Artwork
// Catalogue's Payment tab any more — see the matching removal in
// PurchasePanel. Used for both Gallery- and Own-type Locations (see
// Location.type in schema.prisma) — `channel` stays "GALLERY" for
// either (it's always distinguishing "not taken through Stripe", not
// literally "at a real gallery"); which kind of Location this actually
// is is read from the linked Customer's own `kind` wherever it matters
// (e.g. invoiceEmail.ts's recipient routing).
//
// Buyer captured 2026-09-22 (Phase 1 sale-recording rework, direct
// decision): for a Gallery-type Location the buyer defaults to the
// gallery's own contact if the form leaves it blank (unchanged from
// before — the money is owed by the gallery either way, and it's often
// reluctant to name the actual end buyer); for an Own-type Location the
// artist types the real buyer's own name/email, since there's no
// gallery standing in for them. Either way, whatever the form actually
// sends wins — the gallery-contact fallback only fires when the field
// was left empty.
//
// Raises an invoice for the net amount owed (sale price less commission
// for a Gallery, less any deposit already collected for an Own
// location — see netOwed(), lib/saleMath.ts) and marks the artwork SOLD
// immediately (2026-09-22 — see the file-level Availability note above):
// recording the sale here IS the commit, regardless of whether the
// balance has actually been collected yet. The sale itself
// (Purchase.status) stays ACTIVE ("UNPAID" in the UI) until
// the balance is fully paid (completeIfSettled). `saleDate` is
// when the sale actually happened (can be backdated), not today's date,
// so it's used as the Purchase's own createdAt rather than defaulting
// to now.
export async function startGallerySale(
  artworkId: string,
  customerId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const soldError = await assertArtworkAvailableForSale(artworkId);
  if (soldError) return { ok: false, error: soldError };

  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE", parentPurchaseId: null },
  });
  if (existingActive) {
    return { ok: false, error: "There's already an active sale in progress for this artwork." };
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Location not found." };

  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currencyRaw = (formData.get("currency") as string)?.trim().toUpperCase();
  const currency = currencyRaw || "GBP";
  const commissionPercent = (formData.get("commissionPercent") as string)?.trim() || null;
  const depositPaid = (formData.get("depositPaid") as string)?.trim() || null;
  const buyerName = (formData.get("buyerName") as string)?.trim() || customer.name;
  const buyerEmail = (formData.get("buyerEmail") as string)?.trim() || customer.email;
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
      buyerName,
      buyerEmail,
      buyerAddress: customer.address,
      type: "FULL",
      totalAmount,
      currency,
      commissionPercent,
      depositPaid,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  // Recording the sale is itself the commit (2026-09-22 — see the
  // file-level Availability note above) — straight to SOLD, not
  // RESERVED. Whether the Net Due balance has actually been paid is
  // tracked separately (Purchase.status, still ACTIVE here).
  await db.artwork.update({ where: { id: artworkId }, data: { availability: "SOLD" } });

  return { ok: true, purchaseId: purchase.id };
}

// A persistent, non-expiring Stripe Payment Link for what's still owed
// on a consigned sale (its balance — see saleBreakdown(),
// lib/saleMath.ts). The Payment Links API rather than Checkout Sessions
// (used by createPaymentLink below): an invoice can sit unpaid for
// weeks, and a Checkout Session expires within a day.
//
// Two kinds (2026-09-23, "Stripe payment link" panel):
//   - Full amount (no `instalments`): one link for the whole balance.
//   - Instalments (`instalments` >= 2): a link for the FIRST of that
//     many equal instalments. It saves the buyer's card, and once paid
//     the rest are charged monthly (recordGalleryStripePayment) — the
//     same model as a direct Stripe instalment sale.
// Each kind is stored and reused until the balance changes (a payment,
// or a price/framing/delivery edit), at which point both are retired
// (retireGalleryPaymentLinks) — so a link always charges the current
// figure. Changing the instalment count replaces just the instalment
// link.
//
// purchaseId (and, for the instalment kind, the count) ride on the
// PaymentIntent's own metadata, since Payment Link metadata doesn't
// propagate to it — that's how the webhook recognises the payment.
export async function createGalleryPaymentLink(
  purchaseId: string,
  siteId: string,
  instalments?: number
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { artwork: true, payments: true },
      relationLoadStrategy: "query",
    });
    if (!purchase) return { ok: false, error: "Sale not found." };

    const due = amountToCollect(purchase, instalments);
    if (!due.ok) return due;
    const isInstalments = instalments !== undefined;

    if (!isInstalments && purchase.stripePaymentLinkUrl) {
      return { ok: true, url: purchase.stripePaymentLinkUrl };
    }
    if (isInstalments && purchase.stripeInstalmentLinkUrl) {
      if (purchase.stripeInstalmentLinkCount === instalments) {
        return { ok: true, url: purchase.stripeInstalmentLinkUrl };
      }
      await deactivatePaymentLink(purchase.artworkId, purchase.stripeInstalmentLinkId);
    }

    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);
    const title = saleTitle(purchase.artwork.catalogueName, purchase.chargeKind);
    const amount = due.amount;

    const price = await stripe.prices.create({
      unit_amount: toMinorUnits(amount),
      currency: purchase.currency.toLowerCase(),
      product_data: {
        name: isInstalments ? `${title} — instalment 1 of ${instalments}` : `${title} — balance owed`,
      },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { purchaseId: purchase.id },
      ...(isInstalments
        ? {
            customer_creation: "always" as const,
            payment_intent_data: {
              setup_future_usage: "off_session" as const,
              metadata: { purchaseId: purchase.id, instalments: String(instalments) },
            },
          }
        : { payment_intent_data: { metadata: { purchaseId: purchase.id } } }),
    });

    await db.purchase.update({
      where: { id: purchase.id },
      data: isInstalments
        ? {
            stripeInstalmentLinkId: link.id,
            stripeInstalmentLinkUrl: link.url,
            stripeInstalmentLinkCount: instalments,
          }
        : { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
    });

    return { ok: true, url: link.url };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// "Take Card" on a consigned sale (2026-09-23) — the card is entered
// in the app by the artist (e.g. over the phone) with Stripe's own card
// form (StripeCardForm), for either the whole balance or the first of
// `instalments` equal instalments. The instalment kind saves the card
// (setup_future_usage), and once this first charge succeeds the rest
// are scheduled monthly — exactly as for an instalment payment link;
// both are recorded by the same recordPaymentIntent below.
export async function createGalleryCardIntent(
  purchaseId: string,
  siteId: string,
  instalments?: number
): Promise<
  { ok: true; clientSecret: string; publishableKey: string } | { ok: false; error: string }
> {
  try {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { payments: true },
      relationLoadStrategy: "query",
    });
    if (!purchase) return { ok: false, error: "Sale not found." };

    const due = amountToCollect(purchase, instalments);
    if (!due.ok) return due;
    const isInstalments = instalments !== undefined;

    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);

    let customerId = purchase.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: purchase.buyerEmail || undefined,
        name: purchase.buyerName || undefined,
      });
      customerId = customer.id;
      await db.purchase.update({ where: { id: purchase.id }, data: { stripeCustomerId: customerId } });
    }

    const intent = await stripe.paymentIntents.create({
      amount: toMinorUnits(due.amount),
      currency: purchase.currency.toLowerCase(),
      customer: customerId,
      ...(isInstalments ? { setup_future_usage: "off_session" as const } : {}),
      metadata: {
        purchaseId: purchase.id,
        ...(isInstalments ? { instalments: String(instalments) } : {}),
      },
    });

    if (!intent.client_secret) return { ok: false, error: "Stripe did not return a client secret." };
    return { ok: true, clientSecret: intent.client_secret, publishableKey: getPublishableKey(mode) };
  } catch (err) {
    return { ok: false, error: stripeErrorMessage(err) };
  }
}

// What a Stripe collection on a consigned sale should charge right now:
// the whole balance, or the first of `instalments` equal instalments of
// it. Shared by the payment link and Take Card, so both refuse the same
// cases and always charge the same figure the card shows.
function amountToCollect(
  purchase: Parameters<typeof saleBreakdown>[0] & {
    channel: string;
    status: string;
    stripeSubscriptionScheduleId: string | null;
  },
  instalments?: number
): { ok: true; amount: number } | { ok: false; error: string } {
  if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a consigned sale." };
  if (purchase.status !== "ACTIVE") return { ok: false, error: "This sale has already been paid." };
  if (purchase.stripeSubscriptionScheduleId) {
    return { ok: false, error: "This sale is already being paid by instalments." };
  }
  const { balance } = saleBreakdown(purchase);
  if (balance <= 0) return { ok: false, error: "Nothing is left to pay on this sale." };
  if (instalments === undefined) return { ok: true, amount: balance };
  if (!Number.isInteger(instalments) || instalments < 2 || instalments > 36) {
    return { ok: false, error: "The number of instalments must be between 2 and 36." };
  }
  return { ok: true, amount: splitIntoInstalments(balance, instalments)[0] };
}

// The starting instalment count for the payment link and Take Card
// panels — the count of an instalment link already generated for this
// sale, or else the artist's own Settings default.
export async function getGalleryInstalmentDefault(purchaseId: string): Promise<number> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      stripeInstalmentLinkCount: true,
      artwork: { select: { artist: { select: { defaultInstalmentCount: true } } } },
    },
  });
  return purchase?.stripeInstalmentLinkCount || purchase?.artwork.artist.defaultInstalmentCount || 5;
}

// ---------- Editing an already-started gallery sale's price/currency ----------

// The "Edit Sale" popup (2026-09-12 mockup) — a small, deliberately
// narrow escape hatch for a mistyped price or wrong currency on a sale
// that's already been started, so it doesn't have to be cancelled and
// re-entered from scratch. Nothing else about an in-progress gallery
// sale is editable this way (matches Craig's own "only price and
// currency" note on the mockup).
//
// Restricted to ACTIVE sales only (confirmed decision, 2026-09-12) —
// once a sale is marked paid, its amount is a real financial record and
// stays locked, same principle as the invoice preview already being
// read-only.
//
// Any payment link already generated encodes the old amount, so a
// price or currency change retires it (retireGalleryPaymentLinks).
export async function updateGallerySaleAmount(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a consigned sale." };
  if (purchase.status !== "ACTIVE") {
    return { ok: false, error: "This sale is no longer editable — it's already been paid." };
  }

  const totalAmount = (formData.get("totalAmount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();

  if (!totalAmount) return { ok: false, error: "The sale price is required." };
  if (!currency) return { ok: false, error: "The currency is required." };
  if (Number.isNaN(parseFloat(totalAmount))) return { ok: false, error: "That price isn't valid." };

  const amountChanged = totalAmount !== purchase.totalAmount.toString();
  const currencyChanged = currency !== purchase.currency;
  if (amountChanged || currencyChanged) await retireGalleryPaymentLinks(purchase);

  await db.purchase.update({ where: { id: purchaseId }, data: { totalAmount, currency } });

  return { ok: true };
}

// ---------- Framing / delivery on a consigned sale ----------

// Saves (or, with both fields blank, removes) the one framing or one
// delivery entry on a consigned sale (2026-09-23).
//
// While the sale is still being paid (ACTIVE) the cost is added to this
// sale itself: it's paid by the buyer/gallery, so it adds to Net Due
// (commission is never charged on it), and any payment link is retired
// since it encodes the old balance.
//
// Once the sale has been paid (COMPLETED), the cost instead becomes its
// own separate charge sale (saveChargeSale below) with its own invoice,
// payments and receipt, rather than reopening a paid sale.
export async function saveSaleExtra(
  purchaseId: string,
  siteId: string,
  kind: "framing" | "delivery",
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a consigned sale." };
  if (purchase.parentPurchaseId) {
    return { ok: false, error: "Framing and delivery are arranged on the artwork's own sale." };
  }
  if (purchase.status === "ABANDONED") return { ok: false, error: "This sale was cancelled." };

  const name = (formData.get("name") as string)?.trim() || null;
  const costRaw = (formData.get("cost") as string)?.trim() || "";
  let cost: string | null = null;
  if (costRaw) {
    const n = parseFloat(costRaw);
    if (Number.isNaN(n) || n < 0) return { ok: false, error: "That cost isn't valid." };
    cost = n.toFixed(2);
  }
  if (name && !cost) return { ok: false, error: "Please enter the cost." };

  if (purchase.status === "COMPLETED") return saveChargeSale(purchase, kind, name, cost);

  const current = kind === "framing" ? purchase.framingCost : purchase.deliveryCost;
  const currentCost = current != null ? parseFloat(current.toString()).toFixed(2) : null;
  if (currentCost !== cost) await retireGalleryPaymentLinks(purchase);

  await db.purchase.update({
    where: { id: purchaseId },
    data: kind === "framing" ? { framer: name, framingCost: cost } : { courier: name, deliveryCost: cost },
  });

  return { ok: true };
}

// Creates, edits or removes the framing/delivery charge sale for an
// already-paid sale — at most one live (not cancelled) charge of each
// kind, so pressing the button again edits it, same as before payment.
// The charge copies the sale's buyer and currency; its price is the
// cost, with no commission. The framer/courier name is kept on it in
// the same framer/courier field an ordinary sale uses.
async function saveChargeSale(
  parent: {
    id: string;
    artworkId: string;
    customerId: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    buyerAddress: string | null;
    currency: string;
  },
  kind: "framing" | "delivery",
  name: string | null,
  cost: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const chargeKind = kind === "framing" ? "FRAMING" : "DELIVERY";
  const nameData = kind === "framing" ? { framer: name } : { courier: name };
  const existing = await db.purchase.findFirst({
    where: { parentPurchaseId: parent.id, chargeKind, status: { not: "ABANDONED" } },
    include: { payments: true },
    relationLoadStrategy: "query",
  });

  if (!existing) {
    if (!cost) return { ok: true };
    await db.purchase.create({
      data: {
        artworkId: parent.artworkId,
        channel: "GALLERY",
        parentPurchaseId: parent.id,
        chargeKind,
        customerId: parent.customerId,
        buyerName: parent.buyerName,
        buyerEmail: parent.buyerEmail,
        buyerAddress: parent.buyerAddress,
        type: "FULL",
        totalAmount: cost,
        currency: parent.currency,
        ...nameData,
      },
    });
    return { ok: true };
  }

  if (existing.status !== "ACTIVE") {
    return { ok: false, error: `The ${kind} charge has already been paid.` };
  }

  if (!cost) {
    if (existing.payments.some((p) => p.status === "PAID")) {
      return { ok: false, error: `Payments have been recorded on the ${kind} charge — cancel it instead.` };
    }
    await retireGalleryPaymentLinks(existing);
    await db.purchase.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  if (parseFloat(existing.totalAmount.toString()).toFixed(2) !== cost) {
    await retireGalleryPaymentLinks(existing);
  }
  await db.purchase.update({ where: { id: existing.id }, data: { totalAmount: cost, ...nameData } });
  await completeIfSettled(existing.id);
  return { ok: true };
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
//
// Used by the Studio app's "Record sale" (rule 2 above) — a direct
// sale recorded after the fact, same shape as a historical gallery
// backfill (Purchase.channel only distinguishes STRIPE from "not taken
// through Stripe", not literally "gallery"). Submitting it is itself the
// single commit step — SOLD the moment it succeeds. commissionPercent is
// left out (a direct sale is always 0% commission), so it falls through
// to null/0.
//
// `method` (2026-09-21) — how the sale was paid (bank transfer, cash,
// ...), optional and stored on the Payment, same free-text convention as
// recordGalleryPayment's method. The Studio app sends one chosen from the
// artist's Payment methods list; callers that don't send one leave it
// blank exactly as before.
export async function recordPastSale(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const soldError = await assertArtworkAvailableForSale(artworkId);
  if (soldError) return { ok: false, error: soldError };

  const existingActive = await db.purchase.findFirst({
    where: { artworkId, status: "ACTIVE", parentPurchaseId: null },
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
  const method = (formData.get("method") as string)?.trim() || null;
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

  const net = netOwed({ totalAmount, commissionPercent });

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
          method,
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
//
// Also reverts Availability back to AVAILABLE if this was the sale
// holding it RESERVED — see resetAvailabilityIfNothingSoldOrActive.
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
  await resetAvailabilityIfNothingSoldOrActive(purchase.artworkId);

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
//
// Resets Availability back to AVAILABLE, using the same shared reset
// as deleteGallerySale/abandonPurchase.
export async function forceDeleteCompletedSale(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Sale not found." };

  await db.purchase.delete({ where: { id: purchaseId } });
  await resetAvailabilityIfNothingSoldOrActive(purchase.artworkId);

  return { ok: true };
}

// Reads the optional Date paid and Method a payment form sends. No date
// means now; no method means none recorded.
function readPaidDetails(
  formData: FormData
): { paidDate: Date; method: string | null } | { error: string } {
  const paidDateRaw = (formData.get("paidDate") as string | null)?.trim();
  const method = (formData.get("method") as string | null)?.trim() || null;

  if (!paidDateRaw) return { paidDate: new Date(), method };
  const parsed = new Date(paidDateRaw);
  if (Number.isNaN(parsed.getTime())) return { error: "That date isn't valid." };
  return { paidDate: parsed, method };
}

// The next Payment.sequence for a sale — payments on a consigned sale
// can now arrive in any number and order (partial payments, a link,
// instalments), so this is always "after the last one", never a fixed 1.
function nextSequence(payments: { sequence: number }[]): number {
  return payments.reduce((max, p) => Math.max(max, p.sequence), 0) + 1;
}

// "Record Payment" on a consigned sale (2026-09-23, partial payments) —
// money received outside Stripe (bank transfer, cash, cheque...), of any
// amount up to the balance still owed. Each one is its own PAID Payment
// with its date, amount and method; the sale completes once the balance
// reaches zero (completeIfSettled). Any payment link is retired, since
// the balance it encodes has just changed.
export async function recordGalleryPayment(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase) return { ok: false, error: "Sale not found." };
  if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a consigned sale." };
  if (purchase.status !== "ACTIVE") return { ok: false, error: "This sale has already been paid." };

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };

  const amount = parseFloat((formData.get("amount") as string)?.trim() || "");
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Please enter the amount paid." };
  const { balance } = saleBreakdown(purchase);
  if (Math.round(amount * 100) > Math.round(balance * 100)) {
    return { ok: false, error: `That's more than the ${balance.toFixed(2)} still due.` };
  }

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: nextSequence(purchase.payments),
      amount: amount.toFixed(2),
      currency: purchase.currency,
      status: "PAID",
      paidDate: paid.paidDate,
      method: paid.method,
    },
  });

  await retireGalleryPaymentLinks(purchase);
  await completeIfSettled(purchase.id, paid.paidDate);
  return { ok: true };
}

// The ordinary-sale "Record sale" button on an unpaid sale (2026-09-21):
// the buyer has paid outside Stripe (bank transfer after an invoice,
// cash, ...), so the whole amount is recorded as paid on the date and by
// the method given. Only for a sale nothing has been paid on yet — one
// already part-paid by Stripe has its own payment schedule.
export async function markSalePaid(
  purchaseId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase) return { ok: false, error: "Purchase not found." };
  if (purchase.channel === "GALLERY") {
    return { ok: false, error: "This is a consigned sale — record payments from its own card." };
  }
  if (purchase.status !== "ACTIVE") {
    return { ok: false, error: "This sale is no longer open." };
  }
  if (purchase.payments.length > 0) {
    return { ok: false, error: "Payments have already started on this sale." };
  }

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: 1,
      amount: purchase.totalAmount,
      currency: purchase.currency,
      status: "PAID",
      paidDate: paid.paidDate,
      method: paid.method,
    },
  });
  await completeIfSettled(purchase.id, paid.paidDate);
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

// The sale didn't go ahead — or, for a paid sale (2026-09-23), is being
// cancelled after the fact, with any refund handled outside the app.
// Kept as history (status ABANDONED), not deleted — SaleTerms is
// completely untouched, ready for the next buyer.
// If instalments had already started, also cancels the Stripe schedule so
// nothing keeps auto-charging a sale that isn't happening.
//
// Reverts Availability back to AVAILABLE if this Purchase was the one
// holding it RESERVED — since starting either kind of sale marks
// RESERVED immediately now (2026-09-20 rebuild), this always applies:
// cancelling a sale, at any point after it started, is the way back to
// AVAILABLE. See resetAvailabilityIfNothingSoldOrActive.
export async function abandonPurchase(
  purchaseId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Purchase not found." };

  // A cancelled sale takes its still-open framing/delivery charges with
  // it (paid ones stay, as the real records they are), and nothing about
  // it should stay payable through an old link.
  const openCharges = await db.purchase.findMany({
    where: { parentPurchaseId: purchase.id, status: "ACTIVE" },
    select: { id: true },
  });
  for (const charge of openCharges) await abandonPurchase(charge.id, siteId);
  await retireGalleryPaymentLinks(purchase);

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
    await resetAvailabilityIfNothingSoldOrActive(purchase.artworkId);
    return { ok: false, error: stripeErrorMessage(err) };
  }

  await db.purchase.update({
    where: { id: purchaseId },
    data: { status: "ABANDONED", closedAt: new Date() },
  });
  await resetAvailabilityIfNothingSoldOrActive(purchase.artworkId);

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

async function createPaymentLink(
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
            product_data: { name: purchase.artwork.catalogueName },
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

// Completes a sale once it's fully paid, and marks its artwork SOLD.
// "Fully paid" depends on the channel:
//   - GALLERY (consigned): the balance — Net Due less every PAID
//     payment (saleBreakdown(), lib/saleMath.ts) — has reached zero.
//     Payments can arrive in any mix: partial payments recorded by hand,
//     a payment link, or an instalment plan.
//   - STRIPE (direct): every scheduled Payment row is PAID — a Full
//     sale has one; an instalment sale completes once the last clears.
// Safe to call after any payment; does nothing until the sale is settled.
async function completeIfSettled(purchaseId: string, closedAt: Date = new Date()) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase || purchase.status !== "ACTIVE") return;

  const settled =
    purchase.channel === "GALLERY"
      ? saleBreakdown(purchase).balance <= 0
      : purchase.payments.every((p) => p.status === "PAID");
  if (!settled) return;

  await db.purchase.update({ where: { id: purchaseId }, data: { status: "COMPLETED", closedAt } });
  if (!purchase.parentPurchaseId) {
    await db.artwork.update({ where: { id: purchase.artworkId }, data: { availability: "SOLD" } });
  }
}

// Sets up the monthly auto-charges for the rest of an instalment plan
// once its first instalment has been paid and the buyer's card saved:
// a Stripe Subscription Schedule (one monthly phase per remaining
// instalment) plus one DUE Payment row per instalment, which
// handleInstalmentInvoicePaid/Failed then mark as each charge happens.
// Shared by a direct Stripe instalment sale (handleFirstPaymentSucceeded)
// and a consigned sale's instalment payment link
// (recordGalleryStripePayment).
async function scheduleRemainingInstalments(opts: {
  purchase: { id: string; artworkId: string; currency: string; title: string };
  customerId: string;
  paymentMethodId?: string | null;
  remaining: number[];
  firstSequence: number;
}) {
  const { purchase, customerId, paymentMethodId, remaining, firstSequence } = opts;
  const mode = await getStripeModeForArtwork(purchase.artworkId);
  const stripe = getStripeClient(mode);

  const product = await stripe.products.create({ name: `${purchase.title} — instalment plan` });

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

  const schedule = await stripe.subscriptionSchedules.create({
    customer: customerId,
    start_date: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    end_behavior: "cancel",
    ...(paymentMethodId ? { default_settings: { default_payment_method: paymentMethodId } } : {}),
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
        sequence: firstSequence + i,
        amount: remaining[i],
        currency: purchase.currency,
        status: "DUE",
        dueDate,
      },
    });
  }
}

// Marks the first Payment on a direct Stripe Purchase PAID and completes
// it if that was the only one due. Reached through recordPaymentIntent
// below (both the Stripe webhook and the in-app card form, which records
// the moment Stripe confirms rather than waiting on the webhook), and by
// the Studio app's confirmStudioCardPayment (lib/studioSales.ts), which
// verifies the payment with Stripe itself first. Idempotent (the
// sequence-1 check below), so whichever arrives first does the work.
//
// RESERVED was already set the moment this sale started (see the
// file-level note above); completeIfSettled promotes it to SOLD once the
// final instalment clears.
export async function handleFirstPaymentSucceeded(purchaseId: string, stripePaymentIntentId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { artwork: true, payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase) return;

  // Idempotent — Stripe can deliver the same webhook event more than
  // once, and this can now also race the client-side call above.
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

  if (count > 1) {
    await scheduleRemainingInstalments({
      purchase: {
        id: purchase.id,
        artworkId: purchase.artworkId,
        currency: purchase.currency,
        title: purchase.artwork.catalogueName,
      },
      customerId: purchase.stripeCustomerId!,
      remaining: amounts.slice(1),
      firstSequence: 2,
    });
  }

  await completeIfSettled(purchase.id);
}

// Records a succeeded Stripe PaymentIntent against its sale — the one
// entry point for both the Stripe webhook and the in-app card form
// (StripeCardForm), which calls it the moment Stripe confirms, rather
// than waiting on the webhook alone. It re-reads the PaymentIntent from
// Stripe itself rather than trusting what the caller passes, so it's
// safe to call from the browser, and both handlers it routes to are
// idempotent, so the webhook and the form can both call it.
//
// A consigned (GALLERY) sale is paid through its own payment links or
// Take Card — the full balance or an instalment plan's first instalment
// (recordGalleryStripePayment); a direct Stripe sale goes through
// handleFirstPaymentSucceeded.
export async function recordPaymentIntent(purchaseId: string, paymentIntentId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: { channel: true, artworkId: true },
  });
  if (!purchase) return;

  const mode = await getStripeModeForArtwork(purchase.artworkId);
  const intent = await getStripeClient(mode).paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.metadata?.purchaseId !== purchaseId) return;

  if (purchase.channel !== "GALLERY") {
    await handleFirstPaymentSucceeded(purchaseId, intent.id);
    return;
  }

  const instalments = parseInt(intent.metadata?.instalments || "", 10);
  await recordGalleryStripePayment({
    purchaseId,
    paymentIntentId: intent.id,
    amountReceivedMinor: intent.amount_received,
    currency: intent.currency,
    customerId: typeof intent.customer === "string" ? intent.customer : intent.customer?.id ?? null,
    paymentMethodId:
      typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id ?? null,
    instalments: Number.isFinite(instalments) ? instalments : null,
  });
}

// A consigned sale paid through Stripe — a payment link or Take Card —
// the automatic counterpart to recordGalleryPayment.
//
// Records the amount Stripe actually received as its own PAID Payment
// (so it can sit alongside any partial payments already recorded). If
// it was the instalment kind (`instalments` in the PaymentIntent's
// metadata), this was instalment 1: the buyer's saved card is then
// scheduled for the remaining instalments of the balance as it stood
// when the link/card payment was set up (links are retired whenever the
// balance changes, so that is the balance just before this payment).
// Both links are retired either way, so neither can be paid again, and
// the sale completes if nothing is left owing.
//
// Idempotent: a repeat for the same PaymentIntent is ignored.
async function recordGalleryStripePayment(payment: {
  purchaseId: string;
  paymentIntentId: string;
  amountReceivedMinor: number;
  currency: string;
  customerId: string | null;
  paymentMethodId: string | null;
  instalments: number | null;
}) {
  const purchase = await db.purchase.findUnique({
    where: { id: payment.purchaseId },
    include: { artwork: true, payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase || purchase.channel !== "GALLERY" || purchase.status !== "ACTIVE") return;
  if (purchase.payments.some((p) => p.stripePaymentIntentId === payment.paymentIntentId)) return;

  const balanceBefore = saleBreakdown(purchase).balance;
  const sequence = nextSequence(purchase.payments);

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence,
      amount: fromMinorUnits(payment.amountReceivedMinor),
      currency: payment.currency.toUpperCase(),
      status: "PAID",
      paidDate: new Date(),
      stripePaymentIntentId: payment.paymentIntentId,
    },
  });

  const count = payment.instalments;
  if (count && count >= 2 && payment.customerId) {
    await db.purchase.update({
      where: { id: purchase.id },
      data: { type: "INSTALMENTS", instalmentCount: count, stripeCustomerId: payment.customerId },
    });
    await scheduleRemainingInstalments({
      purchase: {
        id: purchase.id,
        artworkId: purchase.artworkId,
        currency: purchase.currency,
        title: purchase.artwork.catalogueName,
      },
      customerId: payment.customerId,
      paymentMethodId: payment.paymentMethodId,
      remaining: splitIntoInstalments(balanceBefore, count).slice(1),
      firstSequence: sequence + 1,
    });
  }

  await retireGalleryPaymentLinks(purchase);
  await completeIfSettled(purchase.id);
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
  await completeIfSettled(purchase.id);
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
