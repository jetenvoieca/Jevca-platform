import { db } from "@/lib/db";
import { recordPastSale } from "@/lib/purchases";
import { raiseSaleAlert, SALE_RECORDED_ALERT_TYPE } from "@/lib/alerts";

// The Studio app's sales: recording a sale already paid for. (Taking
// payment — a payment link or card — was removed from the app 2026-10-31,
// to come back in a revised form.) It raises an alert so it shows on the
// Alerts list, and the alert remembers its sale, so the Dashboard opens
// it like the Sales page.
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
      select: { catalogueName: true },
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
    purchaseId: result.purchaseId,
    type: SALE_RECORDED_ALERT_TYPE,
    message: `${artist.name}: sold "${artwork.catalogueName}" to ${sale.buyerName} — ${sale.currency} ${parseFloat(sale.totalAmount).toFixed(2)}${method ? `, ${method}` : ""} (recorded in Studio).`,
  });

  return { purchaseId: result.purchaseId };
}
