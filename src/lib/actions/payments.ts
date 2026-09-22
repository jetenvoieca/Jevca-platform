"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { findOrCreateCustomer } from "./customers";
import { netOwed } from "@/lib/saleMath";
import {
  getStripeClient,
  getPublishableKey,
  toMinorUnits,
  fromMinorUnits,
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
  // Only ever set for a GALLERY-channel sale's payment, chosen from
  // Artist.paymentMethods at the moment it's marked paid (2026-09-03) —
  // see markGallerySalePaid below. Null for Stripe-channel payments and
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
  // Money already collected at the moment the sale was recorded
  // (2026-09-22) — only ever set for an Own-location sale. See the
  // matching note on Purchase.depositPaid in schema.prisma.
  depositPaid: string | null;
  invoiceNumber: number | null;
  // Part Three (2026-09-01) — see the matching schema.prisma comments.
  stripePaymentLinkUrl: string | null;
  invoiceEmailedAt: string | null;
  invoiceEmailedTo: string | null;
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

// ---------- Shared: resolve which Stripe mode (Test/Live) applies ----------

async function getStripeModeForArtwork(artworkId: string): Promise<StripeMode> {
  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { artist: { select: { stripeMode: true } } },
  });
  return artwork.artist.stripeMode;
}

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
// The three original commit points, matching Craig's own numbering:
//   1. Enter card clicked                       → RESERVED immediately;
//      → payment succeeds                       → SOLD
//   2. Record sale submitted                     → SOLD (already a
//                                                   single atomic step)
//   3. Get payment link generated                → RESERVED
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
// UI) until markGallerySalePaid confirms it, same as before.
//
// Once RESERVED or SOLD, the Catalogue tab's own Available/SOLD toggle
// disappears entirely — no delete-this-sale link, no reopenable panel.
// Managing or cancelling that sale happens from the Sales page
// (PurchasePanel), which already has the tools for it. This also means
// every Back/Close action inside the Catalogue tab's own sale panel can
// safely be a plain local UI step with no server call at all: by the
// time there's anything worth backing out of, it's already committed,
// and un-committing only ever happens from the Sales page.

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
// but this stays correct even if more than one somehow exists.
async function resetAvailabilityIfNothingSoldOrActive(artworkId: string) {
  const stillHeld = await db.purchase.findFirst({
    where: { artworkId, status: { in: ["COMPLETED", "ACTIVE"] } },
  });
  if (!stillHeld) {
    await db.artwork.update({ where: { id: artworkId }, data: { availability: "AVAILABLE" } });
  }
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
// unnecessary duplication). Every save of this row now takes the artist's
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

// Seeds/refreshes SaleTerms straight from the price being charged
// (2026-09-10) — the Sold panel's "Full payment"/instalment figures are
// computed live from that price minus any Deposit paid noted in the
// panel, not from a separately-saved SaleTerms row the way the old
// Presentation tab's price used to work. Rather than inventing a second,
// parallel start-a-sale pathway, this upserts SaleTerms to match exactly
// what the panel is showing right before handing off to the existing
// startPurchase — so instalment splitting, webhooks, invoices and
// everything else downstream keep working completely unchanged, on a
// totalAmount that's actually correct for what was agreed in the panel.
//
// The price is the artwork's own Offered price, unless the caller passes
// a `price` of its own (2026-09-21) — the Studio app lets the artist
// adjust the price on the spot. The admin never sends one, so it always
// charges the Offered price exactly as before.
//
// Deposit paid isn't recorded as its own Payment row (direct instruction,
// 2026-09-10 — "no deposit handling needed yet, just wire the remaining
// flow") — it only reduces the amount Stripe is asked to collect here.
// Unrelated to Purchase.depositPaid (2026-09-22) — that field is
// specific to a Consigned Works "Record Sale" (a Gallery/Own Location's
// startGallerySale below), a different flow from this one (a direct
// Stripe sale via the Catalogue tab's own Sold panel).
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
export async function startPurchase(
  artworkId: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const soldError = await assertArtworkAvailableForSale(artworkId);
  if (soldError) return { ok: false, error: soldError };

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

// ---------- Starting a sale from the Catalogue tab's Sold panel ----------

// Get payment link (Craig's rule 3): once the Purchase itself is
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

// Enter card now (Craig's rule 1): marks RESERVED the moment the
// Purchase itself is started — the same instant as Get payment link
// above, before the card form has even loaded — rather than waiting
// for the payment to actually succeed. SOLD only happens later, once
// the card payment genuinely confirms (handleFirstPaymentSucceeded/
// completeIfAllPaid, reached via the Stripe webhook or the direct
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
// markGallerySalePaid confirms the balance has come in. `saleDate` is
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
    where: { artworkId, status: "ACTIVE" },
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

// A persistent, non-expiring Stripe Payment Link (2026-09-01, Part
// Three) for the NET amount owed on this sale (sale price less
// commission for a Gallery-type Location, less any deposit already
// collected for an Own-type one — see netOwed(), lib/saleMath.ts) —
// deliberately the Payment Links API, not Checkout Sessions (used by
// createPaymentLink below, for a live Stripe-channel sale): this kind
// of invoice can sit unpaid for weeks, and a Checkout Session's URL
// expires within a day or so, whereas a Payment Link is meant to be
// reusable and doesn't expire. Doesn't require a buyer email on file —
// Stripe collects one at checkout if needed. Re-uses the same link on
// every later call rather than creating a new one each time "Payment
// link" is pressed again, so it's stable to paste into an already-sent
// email or invoice.
//
// payment_intent_data.metadata (2026-09-13) — carries purchaseId onto
// the PaymentIntent this link eventually produces, not just the Payment
// Link record itself (Payment Link metadata does NOT automatically
// propagate to its PaymentIntent). This is what lets the webhook
// (handleGalleryPaymentLinkPaid below) recognise a paid invoice and
// complete the sale automatically, the same way a direct Stripe sale
// already does. Only links created from this point forward carry it —
// a link generated before this change has no metadata on its
// PaymentIntent, so a payment against it still needs "Mark as paid"/
// "Record Payment" clicked by hand.
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
    if (purchase.channel !== "GALLERY") return { ok: false, error: "This isn't a consigned sale." };

    if (purchase.stripePaymentLinkUrl) {
      return { ok: true, url: purchase.stripePaymentLinkUrl };
    }

    const net = netOwed(
      purchase.totalAmount.toString(),
      purchase.commissionPercent?.toString(),
      purchase.depositPaid?.toString()
    );

    const mode = await getStripeModeForArtwork(purchase.artworkId);
    const stripe = getStripeClient(mode);

    const price = await stripe.prices.create({
      unit_amount: toMinorUnits(net),
      currency: purchase.currency.toLowerCase(),
      product_data: { name: `${purchase.artwork.presentationTitle} — balance owed` },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { purchaseId: purchase.id },
      payment_intent_data: { metadata: { purchaseId: purchase.id } },
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
// If a Stripe Payment Link was already generated for the OLD amount, it
// encodes a now-wrong net-owed figure. Rather than leave it live and
// silently stale, it's deactivated in Stripe and cleared here — the
// next press of "Payment Link" (createGalleryPaymentLink) generates a
// fresh one for the corrected amount, since the DB no longer has one on
// file.
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
  const linkNeedsClearing = (amountChanged || currencyChanged) && purchase.stripePaymentLinkId;

  if (linkNeedsClearing) {
    try {
      const mode = await getStripeModeForArtwork(purchase.artworkId);
      const stripe = getStripeClient(mode);
      await stripe.paymentLinks.update(purchase.stripePaymentLinkId!, { active: false });
    } catch {
      // Deactivating the old link in Stripe failing shouldn't block
      // correcting the price locally — worst case a now-stale-looking
      // link stays technically active in Stripe a little longer, which
      // is a Stripe-side cleanup, not a data-correctness problem here.
    }
  }

  await db.purchase.update({
    where: { id: purchaseId },
    data: {
      totalAmount,
      currency,
      ...(linkNeedsClearing ? { stripePaymentLinkId: null, stripePaymentLinkUrl: null } : {}),
    },
  });

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
// Also reused as-is (2026-09-10) by the Catalogue tab's Sold panel's own
// "Record sale" form (Craig's rule 2) — a direct/studio sale recorded
// after the fact, same shape as a historical gallery backfill
// (Purchase.channel only distinguishes STRIPE from "not taken through
// Stripe", not literally "gallery"). Submitting this form is itself the
// single commit step — SOLD the moment it succeeds, same as it's always
// worked. commissionPercent is simply left out of that form's FormData
// (direct instruction — a direct sale is always 0% commission here), so
// it falls through to null/0 exactly like any other caller that doesn't
// set it.
//
// `method` (2026-09-21) — how the sale was paid (bank transfer, cash,
// ...), optional and stored on the Payment, same free-text convention as
// markGallerySalePaid's method. The Studio app sends one chosen from the
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

  const net = netOwed(totalAmount, commissionPercent);

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
// Resets Availability back to AVAILABLE — this is the "manage/cancel it
// from the Sales page" escape hatch the Catalogue tab's own toggle no
// longer offers directly (2026-09-20 rebuild). Uses the same shared
// reset as deleteGallerySale/abandonPurchase.
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

// Reads the optional Date paid and Method a "mark as paid" form sends
// (shared by markGallerySalePaid and markSalePaid below). No date means
// now; no method means none recorded.
function readPaidDetails(
  formData?: FormData
): { paidDate: Date; method: string | null } | { error: string } {
  const paidDateRaw = (formData?.get("paidDate") as string | null)?.trim();
  const method = (formData?.get("method") as string | null)?.trim() || null;

  if (!paidDateRaw) return { paidDate: new Date(), method };
  const parsed = new Date(paidDateRaw);
  if (Number.isNaN(parsed.getTime())) return { error: "That date isn't valid." };
  return { paidDate: parsed, method };
}

// The common ending of every "the money has arrived outside Stripe"
// action: one PAID Payment for what's owed (the sale price less any
// commission — a gallery's cut — and less any deposit already
// collected for an Own-location sale, via netOwed() — see
// lib/saleMath.ts; an ordinary direct sale has neither), the sale
// COMPLETED, and the artwork promoted from RESERVED ("Sold - Not Paid")
// — or, as of 2026-09-22, already SOLD for a Consigned Works sale — to
// (still) SOLD.
async function completeSaleAsPaid(
  purchase: {
    id: string;
    artworkId: string;
    totalAmount: { toString(): string };
    commissionPercent: { toString(): string } | null;
    depositPaid: { toString(): string } | null;
    currency: string;
  },
  paidDate: Date,
  method: string | null
) {
  const net = netOwed(
    purchase.totalAmount.toString(),
    purchase.commissionPercent?.toString(),
    purchase.depositPaid?.toString()
  );

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: 1,
      amount: net,
      currency: purchase.currency,
      status: "PAID",
      paidDate,
      method,
    },
  });

  await db.purchase.update({
    where: { id: purchase.id },
    data: { status: "COMPLETED", closedAt: paidDate },
  });

  await db.artwork.update({ where: { id: purchase.artworkId }, data: { availability: "SOLD" } });
}

// The manual equivalent of a Stripe webhook confirming payment — "Record
// Payment"/"Mark as Paid" (GallerySaleCard), pressed once the Net Due
// balance has actually come in (e.g. by bank transfer), since nothing in
// this flow can confirm that automatically.
//
// Takes an optional Date paid and Method (2026-09-03, matching the
// inline "Mark as paid" form in GallerySaleCard) rather than always
// stamping the exact moment the button is pressed — payment is often
// reported a few days after it actually landed, and knowing how it was
// paid (bank transfer, cash, etc.) is worth keeping alongside the
// amount. `formData` is optional because PurchasePanel (the Artwork
// Catalogue's own Payment tab) still has its own simpler one-click "Mark
// as paid" for a gallery-channel sale, with no date/method form of its
// own — that caller passes nothing and just gets today's date, no
// method, exactly as before this existed. Method is free-form text from
// the caller's point of view (validated only by GallerySaleCard's
// <select>, sourced from Artist.paymentMethods) rather than a hard enum
// here, same convention as Customer.kind elsewhere.
//
// Still needed even now that a Payment Link can complete a sale
// automatically (see handleGalleryPaymentLinkPaid below) — this remains
// the only path for a balance paid by bank transfer, cash, cheque, etc.
// rather than the link.
export async function markGallerySalePaid(
  purchaseId: string,
  siteId: string,
  formData?: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false, error: "Purchase not found." };
  if (purchase.channel !== "GALLERY") {
    return { ok: false, error: "This isn't a consigned sale." };
  }

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };

  await completeSaleAsPaid(purchase, paid.paidDate, paid.method);
  return { ok: true };
}

// The ordinary-sale counterpart of markGallerySalePaid (2026-09-21) — the
// "Record sale" button on an unpaid sale: the buyer has paid outside
// Stripe (bank transfer after an invoice, cash, ...), so the whole amount
// is recorded as paid on the date and by the method given. Only for a sale
// nothing has been paid on yet — one already part-paid by Stripe has its
// own payment schedule.
export async function markSalePaid(
  purchaseId: string,
  siteId: string,
  formData?: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  if (!purchase) return { ok: false, error: "Purchase not found." };
  if (purchase.channel === "GALLERY") {
    return { ok: false, error: "This is a consigned sale — mark it as paid from its own card." };
  }
  if (purchase.status !== "ACTIVE") {
    return { ok: false, error: "This sale is no longer open." };
  }
  if (purchase.payments.length > 0) {
    return { ok: false, error: "Payments have already started on this sale." };
  }

  const paid = readPaidDetails(formData);
  if ("error" in paid) return { ok: false, error: paid.error };

  await completeSaleAsPaid(purchase, paid.paidDate, paid.method);
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
// completes once the last one clears. Also sets the artwork's own
// Availability to SOLD at that same moment — the final promotion from
// RESERVED (already set the moment this sale started — see the
// file-level note above) to genuinely SOLD.
async function completeIfAllPaid(purchaseId: string) {
  const remaining = await db.payment.count({
    where: { purchaseId, status: { not: "PAID" } },
  });
  if (remaining === 0) {
    const purchase = await db.purchase.update({
      where: { id: purchaseId },
      data: { status: "COMPLETED", closedAt: new Date() },
    });
    await db.artwork.update({
      where: { id: purchase.artworkId },
      data: { availability: "SOLD" },
    });
  }
}

// Marks the first Payment on a Purchase PAID and completes it if that
// was the only one due. Normally reached via the Stripe webhook
// (payment_intent.succeeded), but also called directly, client-side,
// the moment stripe.confirmPayment() itself reports success
// (2026-09-20 — see StripeCardForm's own note) — the webhook can be
// slow, misconfigured, or simply not reach this environment at all, and
// a confirmed charge sitting unrecorded as "UNPAID" is a real gap, not
// a cosmetic one. Already idempotent (the sequence-1 payments.some()
// check below), so calling this from both places is safe: whichever
// arrives first does the work, the other is a no-op.
//
// Doesn't touch Availability itself for the INSTALMENTS branch below —
// RESERVED was already set the moment this sale started (see the
// file-level note above), so there's nothing to change here until
// completeIfAllPaid promotes it the rest of the way to SOLD once the
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

// A consigned sale's persistent Payment Link being paid (2026-09-13) —
// the automatic counterpart to markGallerySalePaid above, fired from the
// same payment_intent.succeeded webhook event as a direct Stripe sale,
// but kept as its own function rather than folded into
// handleFirstPaymentSucceeded: that one assumes it's dealing with the
// sale's full gross totalAmount (optionally split into instalments),
// whereas this kind of invoice is only ever charged for the NET amount
// owed (see netOwed(), lib/saleMath.ts) and is never an instalment sale.
// Using the actual amount Stripe confirms it received, rather than
// recomputing net again here, keeps this in step with whatever the link
// was actually generated for even if a figure was edited afterwards.
//
// Idempotent two ways: skipped entirely if the sale is already
// COMPLETED (covers a redelivered webhook), and the Payment Link itself
// is deactivated in Stripe the moment it's paid, so it can't be paid a
// second time by mistake — it's meant for one invoice, not a reusable
// storefront link.
export async function handleGalleryPaymentLinkPaid(
  purchaseId: string,
  stripePaymentIntentId: string,
  amountReceivedMinor: number,
  currency: string
) {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return;
  if (purchase.channel !== "GALLERY") return;
  if (purchase.status === "COMPLETED") return;

  const paidDate = new Date();

  await db.payment.create({
    data: {
      purchaseId: purchase.id,
      sequence: 1,
      amount: fromMinorUnits(amountReceivedMinor),
      currency: currency.toUpperCase(),
      status: "PAID",
      paidDate,
      stripePaymentIntentId,
    },
  });

  await db.purchase.update({
    where: { id: purchaseId },
    data: { status: "COMPLETED", closedAt: paidDate },
  });

  await db.artwork.update({ where: { id: purchase.artworkId }, data: { availability: "SOLD" } });

  if (purchase.stripePaymentLinkId) {
    try {
      const mode = await getStripeModeForArtwork(purchase.artworkId);
      const stripe = getStripeClient(mode);
      await stripe.paymentLinks.update(purchase.stripePaymentLinkId, { active: false });
    } catch {
      // Same reasoning as updateGallerySaleAmount above — failing to
      // deactivate the link in Stripe shouldn't block recording that
      // the balance has genuinely been paid; worst case it stays
      // technically payable in Stripe a little longer.
    }
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
