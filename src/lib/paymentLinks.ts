import { db } from "@/lib/db";
import { getStripeClient, type StripeMode } from "@/lib/stripe";

// Shared server-side helpers for Stripe mode and consigned-sale payment
// links. Kept out of the "use server" actions files (payments.ts,
// artworks.ts) so they can be used by both without becoming actions the
// browser could call directly.

// Which Stripe keys (Test/Live) an artwork's sales use — its artist's
// own setting.
export async function getStripeModeForArtwork(artworkId: string): Promise<StripeMode> {
  const artwork = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    select: { artist: { select: { stripeMode: true } } },
  });
  return artwork.artist.stripeMode;
}

// Retires both of a consigned sale's payment links (full amount and
// instalments) once what they encode is out of date — a payment
// received; the price, currency, framing or delivery changed; or the
// artwork renamed (the name is fixed inside Stripe when a link is made).
// Each is deactivated in Stripe and cleared here, so the next press of a
// payment-link option generates a fresh one.
export async function retireGalleryPaymentLinks(purchase: {
  id: string;
  artworkId: string;
  stripePaymentLinkId: string | null;
  stripeInstalmentLinkId: string | null;
}) {
  if (!purchase.stripePaymentLinkId && !purchase.stripeInstalmentLinkId) return;
  await deactivatePaymentLink(purchase.artworkId, purchase.stripePaymentLinkId);
  await deactivatePaymentLink(purchase.artworkId, purchase.stripeInstalmentLinkId);
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
    select: { id: true, artworkId: true, stripePaymentLinkId: true, stripeInstalmentLinkId: true },
  });
  for (const purchase of purchases) await retireGalleryPaymentLinks(purchase);
}

// A Stripe-side failure never blocks the local change — worst case the
// old link stays technically live in Stripe a little longer.
export async function deactivatePaymentLink(artworkId: string, linkId: string | null) {
  if (!linkId) return;
  try {
    const mode = await getStripeModeForArtwork(artworkId);
    await getStripeClient(mode).paymentLinks.update(linkId, { active: false });
  } catch {
    // See note above.
  }
}
