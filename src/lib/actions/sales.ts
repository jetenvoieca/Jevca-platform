"use server";

import { requireArtistAccess, requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { saleTitle, netOfCommission } from "@/lib/saleMath";
import { isSaleOverdue, overdueInvoiceSelect } from "@/lib/overdue";

export type SaleRow = {
  purchaseId: string;
  artworkId: string;
  artworkTitle: string;
  artworkThumbnail: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  type: "FULL" | "INSTALMENTS";
  totalAmount: string;
  // Sale price less commission — see netOfCommission, lib/saleMath.ts.
  netAmount: string;
  currency: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  // Shown as OVERDUE instead of UNPAID — see lib/overdue.ts.
  overdue: boolean;
  createdAt: string;
  closedAt: string | null;
};

// Every Purchase across the artist's whole catalogue (same scoping as the
// Artwork Catalogue itself — an artist's sales are shared across any of
// their sites, not siloed per-site) so this doesn't need to look "across
// each artwork" to get the picture.
export async function getSalesForArtist(artistId: string): Promise<SaleRow[]> {
  await requireArtistAccess(artistId);
  const purchases = await db.purchase.findMany({
    where: { artwork: { artistId } },
    include: {
      artwork: { include: { mainImage: true, artist: { select: { invoiceOverdueDays: true } } } },
      invoice: overdueInvoiceSelect,
    },
    relationLoadStrategy: "query",
    orderBy: { createdAt: "desc" },
  });

  return purchases.map((p) => ({
    purchaseId: p.id,
    artworkId: p.artworkId,
    artworkTitle: saleTitle(p.artwork.catalogueName, p.chargeKind),
    artworkThumbnail: p.artwork.mainImage?.url ?? null,
    buyerName: p.buyerName,
    buyerEmail: p.buyerEmail,
    type: p.type,
    totalAmount: p.totalAmount.toString(),
    netAmount: netOfCommission(p).toFixed(2),
    currency: p.currency,
    status: p.status,
    overdue: isSaleOverdue(p, p.artwork.artist.invoiceOverdueDays),
    createdAt: p.createdAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
  }));
}

// Sales reset — a full, permanent wipe of an artist's sales data, added
// 2026-08-09 for switching an artist from test-mode Stripe testing to real
// sales with a genuinely clean slate. Deliberately total rather than
// partial ("part deletes lead to misunderstandings" — explicit user
// decision): Purchases, their Payments (cascades automatically per the
// schema's onDelete: Cascade), their Invoices, Sale Terms (pricing), AND
// resets any artwork's availability that isn't already Available. Scoped
// strictly by artistId — never touches another artist's data, since this
// platform is multi-tenant.

export type SalesResetPreview = {
  artistName: string;
  purchaseCount: number;
  paymentCount: number;
  saleTermsCount: number;
  artworksToResetCount: number;
};

export async function getSalesResetPreview(artistId: string): Promise<SalesResetPreview> {
  await requireAdmin();
  const artist = await db.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { name: true },
  });

  const [purchaseCount, paymentCount, saleTermsCount, artworksToResetCount] = await Promise.all([
    db.purchase.count({ where: { artwork: { artistId } } }),
    db.payment.count({
      where: { OR: [{ purchase: { artwork: { artistId } } }, { invoice: { artistId } }] },
    }),
    db.saleTerms.count({ where: { artwork: { artistId } } }),
    db.artwork.count({ where: { artistId, availability: { not: "AVAILABLE" } } }),
  ]);

  return { artistName: artist.name, purchaseCount, paymentCount, saleTermsCount, artworksToResetCount };
}

export async function resetArtistSalesData(
  artistId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await db.$transaction([
      // Payments cascade automatically when their Purchase is deleted, but
      // deleting them explicitly first keeps this readable as a deliberate
      // step rather than relying silently on cascade behaviour.
      db.payment.deleteMany({ where: { purchase: { artwork: { artistId } } } }),
      db.purchase.deleteMany({ where: { artwork: { artistId } } }),
      // Removes the invoices' own payments with them.
      db.invoice.deleteMany({ where: { artistId } }),
      db.statement.deleteMany({ where: { artistId } }),
      db.saleTerms.deleteMany({ where: { artwork: { artistId } } }),
      db.artwork.updateMany({
        where: { artistId, availability: { not: "AVAILABLE" } },
        data: { availability: "AVAILABLE" },
      }),
    ]);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Reset failed. Nothing was changed.",
    };
  }
}
