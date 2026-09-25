import { db } from "@/lib/db";
import { getStripeClientForSale, type SaleStripeFields, type StripeTarget } from "@/lib/stripe";

// Shared server-side helpers for Stripe accounts and consigned-sale
// payment links. Kept out of the "use server" actions files (payments.ts,
// artworks.ts) so they can be used by both without becoming actions the
// browser could call directly.

// Where a NEW sale of this artist's work should be taken (2026-09-25,
// Stripe Connect): the artist's own mode, and their own linked Stripe
// account for that mode if they have one — otherwise Jetenvoieca's own
// account (accountId null). Read once, when a sale is created, and stored
// on the Purchase (stripeMode/stripeAccountId); everything after that uses
// the sale's stored values, never this.
export async function getArtistStripeTarget(artistId: string): Promise<StripeTarget> {
  const artist = await db.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { stripeMode: true, stripeConnections: { select: { mode: true, accountId: true } } },
  });
  const connection = artist.stripeConnections.find((c) => c.mode === artist.stripeMode);
  return { mode: artist.stripeMode, accountId: connection?.accountId ?? null };
}

// The same, in the shape stored on a new Purchase row.
export async function saleStripeFieldsForArtist(artistId: string): Promise<SaleStripeFields> {
  const target = await getArtistStripeTarget(artistId);
  return { stripeMode: target.mode, stripeAccountId: target.accountId };
}

// Retires both of a consigned sale's payment links (full amount and
// instalments) once what they encode is out of date — a payment
// received; the price, currency, framing or delivery changed; the
// artwork renamed (the name is fixed inside Stripe when a link is made);
// or the sale cancelled or deleted. Each is deactivated in Stripe and
// cleared here, so the next press of a payment-link option generates a
// fresh one.
export async function retireGalleryPaymentLinks(
  purchase: SaleStripeFields & {
    id: string;
    stripePaymentLinkId: string | null;
    stripeInstalmentLinkId: string | null;
  }
) {
  if (!purchase.stripePaymentLinkId && !purchase.stripeInstalmentLinkId) return;
  await deactivatePaymentLink(purchase, purchase.stripePaymentLinkId);
  await deactivatePaymentLink(purchase, purchase.stripeInstalmentLinkId);
  await db.purchase.update({
    where: { id: purchase.id },
    data: {
      stripePaymentLinkId: null,
      stripePaymentLinkUrl: null,
      stripeInstalmentLinkId: null,
      stripeInstalmentLinkUrl: null,
      stripeInstalmentLinkCount: null,
    },
  });
}

// Every unpaid sale of an artwork (its own sale and any framing/delivery
// charges) loses its payment links — used when the artwork is renamed.
export async function retireArtworkPaymentLinks(artworkId: string) {
  const purchases = await db.purchase.findMany({
    where: {
      artworkId,
      status: "ACTIVE",
      OR: [{ stripePaymentLinkId: { not: null } }, { stripeInstalmentLinkId: { not: null } }],
    },
    select: {
      id: true,
      stripeMode: true,
      stripeAccountId: true,
      stripePaymentLinkId: true,
      stripeInstalmentLinkId: true,
    },
  });
  for (const purchase of purchases) await retireGalleryPaymentLinks(purchase);
}

// Deactivates one payment link in the Stripe account of the sale it
// belongs to. A Stripe-side failure never blocks the local change —
// worst case the old link stays technically live in Stripe a little
// longer.
export async function deactivatePaymentLink(sale: SaleStripeFields, linkId: string | null) {
  if (!linkId) return;
  try {
    await getStripeClientForSale(sale).paymentLinks.update(linkId, { active: false });
  } catch {
    // See note above.
  }
}
