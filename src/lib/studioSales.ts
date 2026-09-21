import { db } from "@/lib/db";
import { recordPastSale } from "@/lib/actions/payments";
import { raiseSaleRecordedAlert } from "@/lib/alerts";

// Records a sale the artist has already been paid for — exactly what the
// admin Catalogue's "Record sale" does (recordPastSale): the artwork
// becomes SOLD, the buyer is found or created as a customer, and the sale
// is stored as paid on the date given. Then raises a "Sale recorded"
// alert so it shows on the Alerts list.
//
// Only that artist's own artworks can be sold, and recordPastSale itself
// refuses one that already has a sale.
export async function recordStudioSale(
  artist: { id: string; name: string },
  sale: {
    artworkId: string;
    totalAmount: string;
    currency: string;
    saleDate: string;
    source: string;
    buyerName: string;
    buyerEmail: string;
  }
) {
  const artwork = await db.artwork.findFirst({
    where: { id: sale.artworkId, artistId: artist.id },
    select: { presentationTitle: true },
  });
  if (!artwork) return { error: "Artwork not found.", status: 404 as const };

  const formData = new FormData();
  formData.set("totalAmount", sale.totalAmount);
  formData.set("currency", sale.currency);
  formData.set("saleDate", sale.saleDate);
  formData.set("source", sale.source);
  formData.set("buyerName", sale.buyerName);
  formData.set("buyerEmail", sale.buyerEmail);

  // The second argument is a site id that recordPastSale never uses.
  const result = await recordPastSale(sale.artworkId, "", formData);
  if (!result.ok) return { error: result.error, status: 400 as const };

  await raiseSaleRecordedAlert({
    artistId: artist.id,
    message: `${artist.name}: sold "${artwork.presentationTitle}" to ${sale.buyerName} — ${sale.currency} ${parseFloat(sale.totalAmount).toFixed(2)} (recorded in Studio).`,
  });

  return { purchaseId: result.purchaseId };
}
