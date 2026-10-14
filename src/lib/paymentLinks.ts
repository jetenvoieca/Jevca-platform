import { db } from "@/lib/db";
import { getStripeClientForSale, type SaleStripeFields, type StripeTarget } from "@/lib/stripe";

// Shared server-side helpers for Stripe accounts and payment links. Kept
// out of the "use server" actions files so they can be used by several
// without becoming actions the browser could call directly.

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

// Deactivates one payment link in the Stripe account of the sale or
// invoice it belongs to. A Stripe-side failure never blocks the local
// change — worst case the old link stays technically live in Stripe a
// little longer.
export async function deactivatePaymentLink(sale: SaleStripeFields, linkId: string | null) {
  if (!linkId) return;
  try {
    await getStripeClientForSale(sale).paymentLinks.update(linkId, { active: false });
  } catch {
    // See note above.
  }
}
