"use server";

import { db } from "@/lib/db";

export type PaymentReceivedRow = {
  id: string;
  purchaseId: string;
  artworkId: string;
  artworkTitle: string;
  artworkThumbnail: string | null;
  buyerName: string | null;
  type: "FULL" | "INSTALMENTS";
  amount: string;
  currency: string;
  paidBy: string;
  paidAt: string;
};

// One row per individual Payment (2026-09-13, Payments received report)
// — an instalment sale can pay off over several separate dates, and
// each one is its own real payment received, not just a slice of one
// sale total. Scoped by artistId, same convention as getSalesForArtist
// in sales.ts (an artist's sales are shared across any of their sites).
//
// `paidBy` falls back to "Stripe" whenever Payment.method is null — per
// the schema comment on Payment.method, that column is only ever left
// unset for a Stripe-collected payment (a live card charge or an
// instalment plan charge via the webhook handlers in payments.ts);
// every gallery payment marked paid by hand always has a real method
// chosen from Artist.paymentMethods (see recordGalleryPayment).
export async function getPaymentsReceivedForArtist(artistId: string): Promise<PaymentReceivedRow[]> {
  const payments = await db.payment.findMany({
    where: { status: "PAID", purchase: { artwork: { artistId } } },
    include: {
      purchase: {
        include: { artwork: { include: { images: { take: 1 }, mainImage: true } } },
      },
    },
    relationLoadStrategy: "query",
    orderBy: { paidDate: "desc" },
  });

  return payments.map((p) => ({
    id: p.id,
    purchaseId: p.purchaseId,
    artworkId: p.purchase.artworkId,
    artworkTitle: p.purchase.artwork.presentationTitle,
    artworkThumbnail: p.purchase.artwork.mainImage?.url ?? p.purchase.artwork.images[0]?.url ?? null,
    buyerName: p.purchase.buyerName,
    type: p.purchase.type,
    amount: p.amount.toString(),
    currency: p.currency,
    paidBy: p.method || "Stripe",
    // paidDate is always set once status is PAID by every write path in
    // payments.ts, but the column itself is nullable, so createdAt is a
    // safe fallback rather than risking an invalid date downstream.
    paidAt: (p.paidDate ?? p.createdAt).toISOString(),
  }));
}
