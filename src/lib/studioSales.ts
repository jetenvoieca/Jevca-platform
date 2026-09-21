import { db } from "@/lib/db";
import {
  handleFirstPaymentSucceeded,
  recordPastSale,
  startArtworkSaleAndEnterCard,
  startArtworkSaleAndGetLink,
} from "@/lib/actions/payments";
import {
  raiseSaleAlert,
  SALE_LINK_ALERT_TYPE,
  SALE_RECORDED_ALERT_TYPE,
} from "@/lib/alerts";
import { getStripeClient } from "@/lib/stripe";
import { getPrimarySite } from "@/lib/studioSettings";
import type { StudioPaymentDetails } from "@/lib/studioShared";

// The Studio app's sales. Each one runs the same routine as the admin
// Catalogue's Sold panel, so a sale behaves identically however it was
// started — and raises an alert so it shows on the Alerts list.
//
// Only that artist's own artworks can be sold; the routines themselves
// refuse an artwork that already has a sale.

type Artist = { id: string; name: string };

// Records a sale the artist has already been paid for (recordPastSale):
// the artwork becomes SOLD, the buyer is found or created as a customer,
// and the sale is stored as paid on the date given, by the payment type
// given. If the artist has payment types set up in Settings, one of them
// is required.
export async function recordStudioSale(
  artist: Artist,
  sale: {
    artworkId: string;
    totalAmount: string;
    currency: string;
    saleDate: string;
    source: string;
    method: string;
    buyerName: string;
    buyerEmail: string;
  }
) {
  const [artwork, owner] = await Promise.all([
    db.artwork.findFirst({
      where: { id: sale.artworkId, artistId: artist.id },
      select: { presentationTitle: true },
    }),
    db.artist.findUnique({ where: { id: artist.id }, select: { paymentMethods: true } }),
  ]);
  if (!artwork) return { error: "Artwork not found.", status: 404 as const };

  const methods = owner?.paymentMethods ?? [];
  if (methods.length > 0 && !methods.includes(sale.method)) {
    return {
      error: sale.method ? "That payment type isn't on your list." : "Payment type is required.",
      status: 400 as const,
    };
  }
  // Blank when the artist has no payment types set up.
  const method = methods.includes(sale.method) ? sale.method : "";

  const formData = new FormData();
  formData.set("totalAmount", sale.totalAmount);
  formData.set("currency", sale.currency);
  formData.set("saleDate", sale.saleDate);
  formData.set("source", sale.source);
  formData.set("method", method);
  formData.set("buyerName", sale.buyerName);
  formData.set("buyerEmail", sale.buyerEmail);

  // The second argument is a site id that recordPastSale never uses.
  const result = await recordPastSale(sale.artworkId, "", formData);
  if (!result.ok) return { error: result.error, status: 400 as const };

  await raiseSaleAlert({
    artistId: artist.id,
    type: SALE_RECORDED_ALERT_TYPE,
    message: `${artist.name}: sold "${artwork.presentationTitle}" to ${sale.buyerName} — ${sale.currency} ${parseFloat(sale.totalAmount).toFixed(2)}${method ? `, ${method}` : ""} (recorded in Studio).`,
  });

  return { purchaseId: result.purchaseId };
}

// Checks the artwork is this artist's and packs the details into the form
// the payment routines expect. `price` is the price shown on the Studio
// sale panel, which may have been adjusted from the artwork's own.
async function prepareSale(artistId: string, details: StudioPaymentDetails) {
  const [artwork, site] = await Promise.all([
    db.artwork.findFirst({
      where: { id: details.artworkId, artistId },
      select: { presentationTitle: true },
    }),
    getPrimarySite(artistId),
  ]);
  if (!artwork) return { error: "Artwork not found.", status: 404 as const };
  if (!site) return { error: "No website is set up for this artist.", status: 400 as const };

  const formData = new FormData();
  formData.set("price", details.price);
  formData.set("depositPaid", details.deposit);
  formData.set("currency", details.currency);
  formData.set("type", details.option);
  formData.set("source", details.source);
  formData.set("buyerName", details.buyerName);
  formData.set("buyerEmail", details.buyerEmail);

  return { siteId: site.id, formData };
}

// What an alert says about a sale: who bought which work, and how much
// (in how many instalments, if it is an instalment plan).
async function describePurchase(purchaseId: string) {
  const purchase = await db.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    select: {
      buyerName: true,
      totalAmount: true,
      currency: true,
      type: true,
      instalmentCount: true,
      artwork: { select: { presentationTitle: true } },
    },
  });

  const amount = `${purchase.currency} ${parseFloat(purchase.totalAmount.toString()).toFixed(2)}`;
  const inInstalments = purchase.type === "INSTALMENTS" && !!purchase.instalmentCount;
  return {
    title: purchase.artwork.presentationTitle,
    buyer: purchase.buyerName ?? "unnamed buyer",
    amount: inInstalments ? `${amount} in ${purchase.instalmentCount} instalments` : amount,
    inInstalments,
  };
}

// "Get link": starts the sale (the artwork becomes Sold - Not Paid) and
// creates the Stripe payment link for the buyer to pay.
export async function startStudioPaymentLink(artist: Artist, details: StudioPaymentDetails) {
  const prepared = await prepareSale(artist.id, details);
  if ("error" in prepared) return prepared;

  const result = await startArtworkSaleAndGetLink(
    details.artworkId,
    prepared.siteId,
    prepared.formData
  );
  if (!result.ok) return { error: result.error, status: 400 as const };

  const sale = await describePurchase(result.purchaseId);
  await raiseSaleAlert({
    artistId: artist.id,
    type: SALE_LINK_ALERT_TYPE,
    message: `${artist.name}: payment link created for "${sale.title}" to ${sale.buyer} — ${sale.amount} (via Studio). Sold - Not Paid until they pay.`,
  });

  return { purchaseId: result.purchaseId, url: result.url };
}

// "Enter Card": starts the sale (Sold - Not Paid) and prepares the Stripe
// card payment. The card itself is entered in the browser; the sale only
// becomes SOLD once confirmStudioCardPayment has checked it with Stripe.
export async function startStudioCardPayment(artist: Artist, details: StudioPaymentDetails) {
  const prepared = await prepareSale(artist.id, details);
  if ("error" in prepared) return prepared;

  const result = await startArtworkSaleAndEnterCard(
    details.artworkId,
    prepared.siteId,
    prepared.formData
  );
  if (!result.ok) return { error: result.error, status: 400 as const };

  return {
    purchaseId: result.purchaseId,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
  };
}

// Called once the browser reports a card payment went through. Rather than
// taking the phone's word for it, asks Stripe itself whether that payment
// succeeded and belongs to this sale, and only then records it as paid
// (the artwork becomes SOLD) and raises the alert. Safe to repeat: the
// Stripe webhook may record the same payment, and neither will double it.
export async function confirmStudioCardPayment(
  artist: Artist,
  purchaseId: string,
  paymentIntentId: string
) {
  const [purchase, owner] = await Promise.all([
    db.purchase.findFirst({
      where: { id: purchaseId, artwork: { artistId: artist.id } },
      select: { id: true },
    }),
    db.artist.findUnique({ where: { id: artist.id }, select: { stripeMode: true } }),
  ]);
  if (!purchase || !owner) return { error: "Sale not found.", status: 404 as const };

  const intent = await getStripeClient(owner.stripeMode).paymentIntents.retrieve(paymentIntentId);
  if (intent.metadata.purchaseId !== purchaseId) {
    return { error: "That payment doesn't belong to this sale.", status: 400 as const };
  }
  if (intent.status !== "succeeded") {
    return { error: "Stripe hasn't confirmed this payment yet.", status: 409 as const };
  }

  await handleFirstPaymentSucceeded(purchaseId, intent.id);

  const sale = await describePurchase(purchaseId);
  await raiseSaleAlert({
    artistId: artist.id,
    type: SALE_RECORDED_ALERT_TYPE,
    message: `${artist.name}: ${sale.inInstalments ? "first instalment" : "card payment"} taken for "${sale.title}" from ${sale.buyer} — ${sale.amount} (via Studio).`,
  });

  return { ok: true as const };
}
