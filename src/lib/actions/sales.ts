"use server";

import { db } from "@/lib/db";

export type SaleRow = {
  purchaseId: string;
  artworkId: string;
  artworkTitle: string;
  artworkThumbnail: string | null;
  buyerName: string | null;
  buyerEmail: string;
  type: "FULL" | "INSTALMENTS";
  totalAmount: string;
  currency: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  createdAt: string;
  closedAt: string | null;
};

// Every Purchase across the artist's whole catalogue (same scoping as the
// Artwork Catalogue itself — an artist's sales are shared across any of
// their sites, not siloed per-site) so this doesn't need to look "across
// each artwork" to get the picture.
export async function getSalesForArtist(artistId: string): Promise<SaleRow[]> {
  const purchases = await db.purchase.findMany({
    where: { artwork: { artistId } },
    include: { artwork: { include: { images: { take: 1 } } } },
    orderBy: { createdAt: "desc" },
  });

  return purchases.map((p) => ({
    purchaseId: p.id,
    artworkId: p.artworkId,
    artworkTitle: p.artwork.presentationTitle,
    artworkThumbnail: p.artwork.images[0]?.url ?? null,
    buyerName: p.buyerName,
    buyerEmail: p.buyerEmail,
    type: p.type,
    totalAmount: p.totalAmount.toString(),
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
  }));
}
