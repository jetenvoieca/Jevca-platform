"use server";

import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { retireArtworkPaymentLinks, saleInvoicesInclude, toSaleInvoices } from "@/lib/invoices";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { publicMediaUrl } from "@/lib/r2";
import {
  buildArtworkWhere,
  buildArtworkOrderBy,
  SOLD_AVAILABILITIES,
  type ArtworkFilterInput,
} from "@/lib/artworkFilters";
import { deleteArtworkMainImage as deleteArtworkMainImageInternal } from "./imageDelete";
import { isCurrency } from "@/lib/currencies";
import { toArtworkImages } from "@/lib/artworkImages";
import { getArtistDefaultCurrency } from "@/lib/primarySite";
import type { PurchaseDetail } from "./payments";
import { isSaleOverdue, overdueInvoiceSelect } from "@/lib/overdue";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

// Artworks belong to the Artist, not any one Site — the same piece can be
// featured on more than one of that artist's sites. Actions here take an
// explicit `siteId` only where it's needed to know which site's URL to
// redirect to — never to scope which artworks are returned.
//
// Deliberately NOT calling revalidatePath(`/sites/${siteId}/artworks`)
// from most actions below (2026-08-15 removal) — that route is already
// force-dynamic (never statically cached, so there's nothing for
// revalidatePath to usefully invalidate there), and Next.js triggers an
// automatic full refresh of the current route for any Server Action
// that revalidates a path currently being viewed, REGARDLESS of
// whether client code calls router.refresh() itself. That auto-refresh
// was the real cause of the Artwork Catalogue scrolling back to the top
// on every edit — removing an explicit router.refresh() call alone
// wasn't enough, since Next.js was doing the equivalent automatically
// via these revalidatePath calls. The embedded Catalogue view already
// keeps itself in sync via direct client-side fetches
// (getArtworkDetailForClient/listArtworks), so this revalidation was
// pure downside for that flow. createArtwork keeps its call since it's
// immediately followed by a real redirect(), not an in-place edit.

async function nextCatalogueNumber(artistId: string) {
  // Based on the highest catalogue number actually in use, not the row
  // count — count() breaks the moment any artwork is ever deleted, since
  // the count drops but a surviving artwork can still hold a higher
  // number, causing the next "count + 1" guess to collide with it.
  const rows = await db.artwork.findMany({
    where: { artistId },
    select: { catalogueNumber: true },
  });
  const highest = rows.reduce((max, r) => {
    const match = r.catalogueNumber.match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 0);
  return `AW-${String(highest + 1).padStart(4, "0")}`;
}

// The client an artwork belongs to, once the person logged in is checked
// to have access to it (2026-10-26).
async function artworkOwner(artworkId: string): Promise<{ artistId: string }> {
  const artwork = await db.artwork.findUnique({ where: { id: artworkId }, select: { artistId: true } });
  await requireRecordAccess(Promise.resolve(artwork));
  return artwork!;
}

// Wraps a create attempt with a short retry in case two artworks are
// created at the exact same instant and both compute the same next
// number — rare, but cheap to guard against. Exported (2026-08-11) so the
// CSV import reuses the exact same numbering logic — one shared counter,
// so manually-added and imported artworks can never collide.
export async function createArtworkWithRetry(
  artistId: string,
  data: Partial<{
    catalogueName: string;
    presentationPrice: number | null;
    description: string | null;
    medium: string | null;
    // "Can be viewed at" — set at creation by the Hopper for a work
    // imported from an old website (2026-10-26).
    viewingLocation: string | null;
    availability: Availability;
    type: string | null;
    size: string | null;
    // Added (2026-09-07) so the Hopper's one-shot "Add Artwork" flow can
    // set these too, now that its quick-add form shares the exact same
    // field set as the Catalogue tab (see ArtworkCatalogueFields.tsx).
    edition: string | null;
    availableQty: number | null;
    location: string | null;
    studioNotes: string | null;
    // Free text (e.g. "June 2025"), not a number — renamed + retyped
    // from the old numeric `year` (2026-09-07). Added (2026-08-18) for
    // the Hopper's one-shot "Add Artwork" flow — no prior caller needed
    // this at creation time, only updateCatalogue (an in-place edit) did.
    date: string | null;
    // Optional (2026-08-17) — only the CSV import passes this true.
    // Regular "+ New" and duplicateArtwork both omit it, defaulting to
    // Prisma's own schema default (false) — see the matching note on
    // Artwork.needsReview in schema.prisma.
    needsReview: boolean;
    // Which artwork (if any) this one is a "Create Derivative" copy of
    // (2026-09-11) — see the matching note on Artwork.derivedFromId in
    // schema.prisma. Only ever set by duplicateArtwork below.
    derivedFromId: string | null;
    // Added (2026-09-13) so the Hopper's "Create new artwork" form can
    // set this at creation time too, now that its quick-create form
    // matches the full Artwork Catalogue tab (Name and Reference+Offered
    // price included). Kept as a string, same as every other
    // price-shaped field here — this is always read straight off a form
    // field.
    offeredPrice: string | null;
    // The currency of offeredPrice — omitted, it starts in the artist's
    // default currency (getArtistDefaultCurrency, lib/primarySite.ts).
    priceCurrency: string;
  }> & { catalogueName: string }
) {
  await requireArtistAccess(artistId);
  const priceCurrency = data.priceCurrency ?? (await getArtistDefaultCurrency(artistId));
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalogueNumber = await nextCatalogueNumber(artistId);
    try {
      return await db.artwork.create({
        data: { artistId, catalogueNumber, ...data, priceCurrency },
      });
    } catch (err: unknown) {
      const isUniqueViolation =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw err;
    }
  }
  throw new Error("Could not generate a unique catalogue number.");
}

// "+ New" — a Name is optional. If left blank the record is created as
// "Untitled" so you can jump straight in and upload an image first, name
// it later. Name (catalogueName) is the artwork's one and only name,
// used everywhere (the separate Presentation title was retired
// 2026-09-23, direct request).
// `siteId` here is only which site you're currently working in, so the
// new artwork's editor opens back on that site's URL — it doesn't scope
// ownership, `artistId` does.
export async function createArtwork(artistId: string, siteId: string, formData: FormData) {
  await requireArtistAccess(artistId);
  const title = (formData.get("title") as string)?.trim() || "Untitled";

  const artwork = await createArtworkWithRetry(artistId, {
    catalogueName: title,
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  redirect(`/sites/${siteId}/artworks?selected=${artwork.id}`);
}

// "Create Derivative" (2026-08-16) — for when the same physical piece
// legitimately exists as more than one sellable listing (e.g. an
// Original alongside a Paper Edition of it, or the same image reused for
// a different size option). Duplicates the Catalogue fields, Presentation
// fields (including pricing, so it's immediately sellable — not left
// needing a re-save before Payment will accept a sale), and every image
// currently on the artwork — main and Related alike.
//
// Images are duplicated as new `Image` rows pointing at the exact same
// stored file (same `key`/`url`/thumbnailKey/displayKey), not re-uploaded
// — `Image.artworkId` is a single foreign key (one image belongs to
// exactly one artwork), so two artworks can never literally share one
// row, but they can cheaply share the same underlying file.
//
// Name (2026-09-11, direct request — "don't add 'derivative' to
// title") — copied across exactly as-is, no " Derivative" suffix. The
// new artwork's link back to the one it was copied from is instead shown
// explicitly in the Catalogue tab's header ("Derived from #...") via
// derivedFromId, set below.
//
// What else gets copied now depends on the original's Type (2026-09-11,
// direct request):
// - "Original"/"Unique" (isOriginalOrUnique below) — every field except
//   the name is left blank on the new derivative. The whole point of
//   deriving from a one-off piece is a genuinely fresh sellable listing
//   (e.g. a print edition made from an original painting), not a copy of
//   details that don't apply to it.
// - Anything else (typically an edition) — every field is carried over
//   unchanged, same as before this change, EXCEPT Location (always
//   blank — a new edition print isn't automatically sitting wherever the
//   original is) and Edition (set to `newEdition`, collected by the
//   caller — see ArtworkDetailPanel's handleDuplicate — before this runs,
//   since a new edition copy needs its own edition number, not the
//   original's).
//
// Deliberately reset rather than copied, in both cases:
// - Availability always starts AVAILABLE, regardless of the original's
//   current status — a derivative is a distinct, not-yet-sold listing,
//   even if the original it was copied from has since sold.
// - No Purchase/sale history is copied — a derivative has never been
//   sold itself.
// - A fresh catalogueNumber is generated the normal way (nextCatalogueNumber,
//   via createArtworkWithRetry) — never reuses the original's number.
// - Curations aren't copied — a derivative is added to a curation
//   from the Curations page like any other artwork.
export async function duplicateArtwork(
  artworkId: string,
  siteId: string,
  newEdition?: string | null
) {
  await artworkOwner(artworkId);
  const original = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    include: { images: true, saleTerms: true },
  });

  const typeLower = (original.type || "").trim().toLowerCase();
  const isOriginalOrUnique = typeLower.includes("original") || typeLower.includes("unique");

  const created = await createArtworkWithRetry(original.artistId, {
    catalogueName: original.catalogueName,
    presentationPrice: isOriginalOrUnique
      ? null
      : original.presentationPrice != null
        ? Number(original.presentationPrice)
        : null,
    description: isOriginalOrUnique ? null : original.description,
    medium: isOriginalOrUnique ? null : original.medium,
    availability: "AVAILABLE",
    type: isOriginalOrUnique ? null : original.type,
    size: isOriginalOrUnique ? null : original.size,
    // Always blank, in both branches — see the note above.
    location: null,
    studioNotes: isOriginalOrUnique ? null : original.studioNotes,
    derivedFromId: original.id,
  });

  // Fields createArtworkWithRetry's signature doesn't cover (added to the
  // schema after that helper was written for the plain "+ New" flow) —
  // a follow-up update rather than extending that shared signature, to
  // avoid changing behaviour for its other caller (CSV import).
  await db.artwork.update({
    where: { id: created.id },
    data: {
      date: isOriginalOrUnique ? null : original.date,
      edition: isOriginalOrUnique ? null : newEdition?.trim() || original.edition,
      availableQty: isOriginalOrUnique ? null : original.availableQty,
      offeredPrice: isOriginalOrUnique ? null : original.offeredPrice,
      ...(isOriginalOrUnique ? {} : { priceCurrency: original.priceCurrency }),
      presentationMedium: isOriginalOrUnique ? null : original.presentationMedium,
      viewingLocation: isOriginalOrUnique ? null : original.viewingLocation,
    },
  });

  // Copy Sale Terms too, not just presentationPrice — so the derivative
  // is immediately ready to sell (Payment tab checks for a SaleTerms row
  // existing before it will start a Stripe/Gallery sale) rather than
  // silently needing an extra visit-and-resave of Presentation first.
  // Skipped for Original/Unique (2026-09-11) — offeredPrice is blank
  // there, so a copied Sale Terms row would be inconsistent with it.
  if (original.saleTerms && !isOriginalOrUnique) {
    await db.saleTerms.create({
      data: {
        artworkId: created.id,
        totalAmount: original.saleTerms.totalAmount,
        currency: original.saleTerms.currency,
        instalmentCount: original.saleTerms.instalmentCount,
        releaseMessage: original.saleTerms.releaseMessage,
        releaseTriggerCount: original.saleTerms.releaseTriggerCount,
      },
    });
  }

  // Duplicate every image row (main and Related alike) — Promise.all
  // preserves input order in its results, which is what lets the
  // mainImageId lookup below just match by array index rather than
  // needing to re-identify anything after the fact.
  const newImages = await Promise.all(
    original.images.map((img) =>
      db.image.create({
        data: {
          artistId: original.artistId,
          key: img.key,
          url: img.url,
          thumbnailKey: img.thumbnailKey,
          displayKey: img.displayKey,
          posterUrl: img.posterUrl,
          kind: img.kind,
          mimeType: img.mimeType,
          caption: img.caption,
          altText: img.altText,
          tags: img.tags,
          status: img.status,
          source: img.source,
          artworkId: created.id,
        },
      })
    )
  );

  if (original.mainImageId) {
    const mainIndex = original.images.findIndex((img) => img.id === original.mainImageId);
    if (mainIndex !== -1) {
      await db.artwork.update({
        where: { id: created.id },
        data: { mainImageId: newImages[mainIndex].id },
      });
    }
  }

  return { id: created.id };
}

// The shared catalogue filters (lib/artworkFilters.ts — the same ones
// the PDF/CSV exports use, so there's one definition of what a filter
// means), plus pagination — added 2026-08-11 once the catalogue reached
// real size (~150 artworks after the CSV import). Previously fetched
// every matching row unconditionally, every time, the same issue
// already fixed on Media Catalogue.
type ListFilters = ArtworkFilterInput & {
  offset?: number;
  limit?: number;
};

const DEFAULT_PAGE_SIZE = 60;

// One row of the Artwork Catalogue grid — only what a tile or list row
// needs. Returned ready to use (price as a string, image resolved to its
// thumbnail) so both catalogue pages and the grid's own client-side
// fetches share this one shape, instead of each re-mapping it
// (2026-09-24 — there had been four copies of that mapping).
export type ArtworkListRow = {
  id: string;
  catalogueName: string;
  presentationPrice: string | null;
  catalogueNumber: string;
  availability: string;
  type: string | null;
  imageUrl: string | null;
};

// Every distinct artwork name for the artist, A–Z the same way the grid
// sorts (natural-language collation, see buildArtworkOrderBy) — the
// Artwork Catalogue's Name dropdown (2026-10-13).
export async function listArtworkNames(artistId: string): Promise<string[]> {
  await requireArtistAccess(artistId);
  const rows = await db.artwork.findMany({
    where: { artistId },
    distinct: ["catalogueName"],
    orderBy: { catalogueName: "asc" },
    select: { catalogueName: true },
  });
  return rows.map((r) => r.catalogueName);
}

// Lightweight rows for the grid — only what a tile needs to render.
// Full detail is fetched separately (getArtworkDetail) when a tile is opened.
export async function listArtworks(
  artistId: string,
  filters: ListFilters
): Promise<{ rows: ArtworkListRow[]; total: number; soldCount: number }> {
  await requireArtistAccess(artistId);
  const { offset = 0, limit = DEFAULT_PAGE_SIZE } = filters;

  const orderBy = buildArtworkOrderBy(filters.sort);
  const where = buildArtworkWhere(artistId, filters);

  const [rows, total, soldCount] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy,
      select: {
        id: true,
        catalogueName: true,
        presentationPrice: true,
        catalogueNumber: true,
        availability: true,
        type: true,
        // mainImage is a direct single-row lookup (via mainImageId),
        // not a scan — cheap even across many rows. Preferred over
        // images[0] wherever both are available (2026-08-16); images
        // stays as the fallback for artworks with no main image chosen
        // yet, same as before.
        mainImage: { select: { url: true, thumbnailKey: true } },
        images: { take: 1, select: { url: true, thumbnailKey: true } },
      },
      skip: offset,
      take: limit,
    }),
    db.artwork.count({ where }),
    // Over the whole filtered set, not just this page — otherwise the
    // "X sold" summary would silently only ever reflect whatever
    // happened to be on the current page. Includes RESERVED ("Sold -
    // Not Paid"), same as the Sold filter — see SOLD_AVAILABILITIES.
    db.artwork.count({ where: { ...where, availability: { in: SOLD_AVAILABILITIES } } }),
  ]);

  // Prefers the small thumbnail (fast, served straight from storage) —
  // falls back to the original proxied url for any image uploaded before
  // 2026-08-13 that hasn't been backfilled yet, so nothing breaks or goes
  // blank in the meantime. An artwork with a chosen main image shows
  // that one; anything without one falls back to its first image.
  const listRows: ArtworkListRow[] = rows.map(
    ({ mainImage, images, presentationPrice, ...rest }) => {
      const effectiveImage = mainImage || images[0] || null;
      return {
        ...rest,
        presentationPrice: presentationPrice != null ? presentationPrice.toString() : null,
        imageUrl: effectiveImage
          ? publicMediaUrl(effectiveImage.thumbnailKey) || effectiveImage.url
          : null,
      };
    }
  );

  return { rows: listRows, total, soldCount };
}

// Full record for the slide-in detail panel — both facets, all images.
export async function getArtworkDetail(id: string) {
  await artworkOwner(id);
  const result = await db.artwork.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: {
      images: true,
      purchases: {
        include: {
          payments: { orderBy: { sequence: "asc" } },
          invoiceLines: saleInvoicesInclude,
          invoice: overdueInvoiceSelect,
          customer: { select: { kind: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      artist: { select: { invoiceOverdueDays: true } },
      // Only the catalogue number is actually shown ("Derived from
      // #AW-0021") — 2026-09-11, see the matching note on
      // Artwork.derivedFromId in schema.prisma.
      derivedFrom: { select: { catalogueNumber: true } },
    },
  });
  return result;
}

// getArtworkDetail returns raw Prisma data, including Decimal price
// fields — fine when a Server Component converts them before handing off
// as props (the existing routes already do this), but Decimal isn't safely
// serializable across a direct client-to-server-action call. This is that
// same data, pre-converted, for callers that need to fetch it straight
// from a client component (e.g. clicking an artwork tile to edit it
// in-place, as the Section editor does).
export async function getArtworkDetailForClient(id: string) {
  await artworkOwner(id);
  const artwork = await getArtworkDetail(id);
  if (!artwork) return null;

  const allPurchases: PurchaseDetail[] = artwork.purchases.map((p) => ({
    id: p.id,
    status: p.status,
    channel: p.channel,
    buyerName: p.buyerName,
    buyerEmail: p.buyerEmail,
    buyerAddress: p.buyerAddress,
    type: p.type,
    framed: p.framed,
    source: p.source,
    commissionPercent: p.commissionPercent != null ? p.commissionPercent.toString() : null,
    priceAsSold: p.priceAsSold != null ? p.priceAsSold.toString() : null,
    currencyAsSold: p.currencyAsSold,
    vatPercentRemoved: p.vatPercentRemoved != null ? p.vatPercentRemoved.toString() : null,
    exchangeRate: p.exchangeRate != null ? p.exchangeRate.toString() : null,
    // Framing/delivery charge sales (2026-09-23) — filled in below.
    parentPurchaseId: p.parentPurchaseId,
    chargeKind: p.chargeKind,
    charges: [],
    // Money already collected at record-sale time (2026-09-22) — only
    // ever set for an Own-location sale. See the matching note on
    // Purchase.depositPaid in schema.prisma.
    depositPaid: p.depositPaid != null ? p.depositPaid.toString() : null,
    framer: p.framer,
    framingCost: p.framingCost != null ? p.framingCost.toString() : null,
    courier: p.courier,
    deliveryCost: p.deliveryCost != null ? p.deliveryCost.toString() : null,
    // Every invoice the sale is or was on (2026-10-14).
    invoices: toSaleInvoices(p.invoiceLines),
    location:
      p.customerId && (p.customer?.kind === "GALLERY" || p.customer?.kind === "OWN")
        ? { customerId: p.customerId, kind: p.customer.kind }
        : null,
    // Certificate of Authenticity sent-log (2026-09-03) — see the
    // matching schema.prisma/payments.ts comments.
    certificateEmailedAt: p.certificateEmailedAt ? p.certificateEmailedAt.toISOString() : null,
    certificateEmailedTo: p.certificateEmailedTo,
    overdue: isSaleOverdue(p, artwork.artist.invoiceOverdueDays),
    totalAmount: p.totalAmount.toString(),
    currency: p.currency,
    instalmentCount: p.instalmentCount,
    releaseMessage: p.releaseMessage,
    releaseTriggerCount: p.releaseTriggerCount,
    createdAt: p.createdAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    payments: p.payments.map((pay) => ({
      id: pay.id,
      sequence: pay.sequence,
      amount: pay.amount.toString(),
      currency: pay.currency,
      status: pay.status,
      dueDate: pay.dueDate ? pay.dueDate.toISOString() : null,
      paidDate: pay.paidDate ? pay.paidDate.toISOString() : null,
      // 2026-09-03 — see the matching schema.prisma/payments.ts comments.
      method: pay.method,
    })),
  }));

  // A framing/delivery charge sale (2026-09-23) is shown under the sale
  // it belongs to, never as the artwork's own sale — so it can't be
  // mistaken for the active sale or appear in the sale history itself.
  const purchases = allPurchases
    .filter((p) => !p.parentPurchaseId)
    .map((p) => ({ ...p, charges: allPurchases.filter((c) => c.parentPurchaseId === p.id) }));

  return {
    id: artwork.id,
    artistId: artwork.artistId,
    catalogueNumber: artwork.catalogueNumber,
    presentationPrice: artwork.presentationPrice != null ? artwork.presentationPrice.toString() : null,
    description: artwork.description,
    medium: artwork.medium,
    presentationMedium: artwork.presentationMedium,
    viewingLocation: artwork.viewingLocation,
    availability: artwork.availability,
    visible: artwork.visible,
    catalogueName: artwork.catalogueName,
    date: artwork.date,
    type: artwork.type,
    size: artwork.size,
    location: artwork.location,
    edition: artwork.edition,
    availableQty: artwork.availableQty,
    offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
    priceCurrency: artwork.priceCurrency,
    studioNotes: artwork.studioNotes,
    // "Derived from #..." (2026-09-11) — null for any artwork that
    // isn't itself a derivative. See the matching note on
    // Artwork.derivedFromId in schema.prisma.
    derivedFromCatalogueNumber: artwork.derivedFrom?.catalogueNumber ?? null,
    // Which image (if any) is actually Main (2026-09-13) — exposed
    // explicitly rather than left for the client to infer from array
    // position. The images array below is still sorted Main-first when
    // one is set, but ArtworkImageManager now needs to tell Main and
    // Related apart with certainty (no more "Set as Main" swapping
    // between existing images — see actions/artworks.ts), so an id
    // comparison against this replaces the old positional guess.
    mainImageId: artwork.mainImageId,
    // Main image first — see toArtworkImages (lib/artworkImages.ts).
    images: toArtworkImages(artwork.images, artwork.mainImageId),
    activePurchase: purchases.find((p) => p.status === "ACTIVE") || null,
    purchaseHistory: purchases.filter((p) => p.status !== "ACTIVE"),
  };
}

export async function updateCatalogue(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  await artworkOwner(id);
  const catalogueName = (formData.get("catalogueName") as string)?.trim();
  const dateRaw = (formData.get("date") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const edition = (formData.get("edition") as string)?.trim() || null;
  const availableQtyRaw = (formData.get("availableQty") as string)?.trim();
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  // The actual asking price (2026-08-28), replacing the old "Catalogue
  // holds no price" rule now that Offered price is the one place price
  // is typed at all.
  const offeredPriceRaw = (formData.get("offeredPrice") as string)?.trim();
  const priceCurrencyRaw = (formData.get("priceCurrency") as string)?.trim() ?? "";

  // The public website's "Can be viewed at" is seeded once from
  // Catalogue's Location — only while it's still at its untouched default.
  // (Presentation medium needs no seeding: until changed in a curation's
  // Presentation panel it is the Catalogue's Medium — see
  // updateArtworkPresentationMedium.)
  const current = await db.artwork.findUnique({
    where: { id },
    select: { catalogueName: true, viewingLocation: true },
  });

  const presentationUpdate: {
    viewingLocation?: string;
  } = {};
  if (!current?.viewingLocation && location) {
    presentationUpdate.viewingLocation = location;
  }

  await db.artwork.update({
    where: { id },
    data: {
      catalogueName,
      date: dateRaw || null,
      type,
      size,
      location,
      edition,
      availableQty: availableQtyRaw ? parseInt(availableQtyRaw, 10) : null,
      studioNotes,
      medium,
      offeredPrice: offeredPriceRaw || null,
      // Mirrors into Presentation's Price (2026-08-28) — see the note on
      // Artwork.presentationPrice in schema.prisma for why this stays a
      // real synced column rather than every consumer re-plumbed to read
      // offeredPrice directly.
      presentationPrice: offeredPriceRaw || null,
      // Only a currency we support is saved; anything else leaves the
      // stored one unchanged.
      ...(isCurrency(priceCurrencyRaw) ? { priceCurrency: priceCurrencyRaw } : {}),
      // Cleared on any real save here — this being saved at all is
      // exactly "reviewed and edited" for the purposes of the raw-import
      // count next to Artwork Catalogue in the nav (2026-08-17).
      // Harmless for an artwork that was never flagged — already false.
      needsReview: false,
      ...presentationUpdate,
    },
  });

  // A payment link has the artwork's name fixed inside Stripe, so a
  // rename retires the links of its unpaid invoices; a fresh one is made
  // with the new name.
  if (catalogueName && current && catalogueName !== current.catalogueName) {
    await retireArtworkPaymentLinks(id);
  }
}

// The artwork's price, edited from the Curations page's Purchase Options
// (2026-10-03). Writes the same price fields updateCatalogue does —
// offeredPrice, its presentationPrice mirror (see the note on
// Artwork.presentationPrice in schema.prisma) and priceCurrency — so the
// change applies everywhere the artwork is shown and sold. Only ever
// changes an artwork belonging to this artist.
export async function updateArtworkPrice(
  artworkId: string,
  artistId: string,
  priceRaw: string,
  currency: string
): Promise<{ ok: true; offeredPrice: string | null } | { error: string }> {
  await requireArtistAccess(artistId);
  const trimmed = priceRaw.trim();
  const amount = trimmed ? Number(trimmed) : null;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return { error: "Enter a valid price." };
  }
  if (!isCurrency(currency)) return { error: "That currency isn't supported." };

  const offeredPrice = amount != null ? amount.toFixed(2) : null;
  const { count } = await db.artwork.updateMany({
    where: { id: artworkId, artistId },
    data: { offeredPrice, presentationPrice: offeredPrice, priceCurrency: currency },
  });
  if (count === 0) return { error: "Not found — it may have been deleted." };
  return { ok: true, offeredPrice };
}

// The artwork's name, edited from the Curations page (2026-10-03) — its
// one and only name, so this renames it everywhere. Retires the payment
// links on its unpaid sales, same as a rename from the Catalogue (see
// updateCatalogue). Only ever changes an artwork belonging to this
// artist.
export async function updateArtworkName(
  artworkId: string,
  artistId: string,
  nameRaw: string
): Promise<{ ok: true; catalogueName: string } | { error: string }> {
  await requireArtistAccess(artistId);
  const catalogueName = nameRaw.trim();
  if (!catalogueName) return { error: "A name is required." };

  const current = await db.artwork.findFirst({
    where: { id: artworkId, artistId },
    select: { catalogueName: true },
  });
  if (!current) return { error: "Not found — it may have been deleted." };
  if (current.catalogueName === catalogueName) return { ok: true, catalogueName };

  await db.artwork.update({ where: { id: artworkId }, data: { catalogueName } });
  await retireArtworkPaymentLinks(artworkId);
  return { ok: true, catalogueName };
}

// The artwork's Presentation medium (2026-10-26) — the italic line in its
// presentation on the website, edited in a curation's Presentation panel
// and the same in every curation. Null (never changed) = the Catalogue's
// Medium, kept current; saved blank it stays "" and shows nothing.
export async function updateArtworkPresentationMedium(
  artworkId: string,
  artistId: string,
  mediumRaw: string
): Promise<{ ok: true; presentationMedium: string } | { error: string }> {
  await requireArtistAccess(artistId);
  const presentationMedium = mediumRaw.trim();
  const { count } = await db.artwork.updateMany({
    where: { id: artworkId, artistId },
    data: { presentationMedium },
  });
  if (count === 0) return { error: "Not found — it may have been deleted." };
  return { ok: true, presentationMedium };
}

// Called when leaving the editor (Close) rather than on every keystroke —
// deletes the record only if absolutely nothing has been added since
// creation (still "Untitled", no image, no facet fields, no payment
// plan). This is what actually prevents blank artworks accumulating: the
// "+ Add New" tile has to create a real row immediately (same
// zero-friction pattern used everywhere else — Sites, Pages), so the only
// way to keep the catalogue clean is to quietly remove it again if you
// close without ever touching it, rather than asking for a title upfront
// and breaking that pattern.
export async function deleteArtworkIfBlank(siteId: string, artworkId: string) {
  await artworkOwner(artworkId);
  const artwork = await db.artwork.findUnique({
    where: { id: artworkId },
    include: { images: true, saleTerms: true, purchases: true },
    relationLoadStrategy: "query",
  });
  if (!artwork) return;

  const isBlank =
    artwork.catalogueName === "Untitled" &&
    artwork.images.length === 0 &&
    !artwork.saleTerms &&
    artwork.purchases.length === 0 &&
    !artwork.presentationPrice &&
    !artwork.offeredPrice &&
    !artwork.description &&
    !artwork.medium &&
    !artwork.presentationMedium &&
    !artwork.viewingLocation &&
    !artwork.date &&
    !artwork.type &&
    !artwork.size &&
    !artwork.location &&
    !artwork.edition &&
    !artwork.availableQty &&
    !artwork.studioNotes;

  if (!isBlank) return;

  await db.artwork.delete({ where: { id: artworkId } });
}

export async function deleteArtwork(siteId: string, id: string) {
  await artworkOwner(id);
  await db.artwork.delete({ where: { id } });
}

// Links one or more already-uploaded Images to this artwork as
// (Main and/or Related — see the note below) — this is what the
// Catalogue tab's "+ Add" tiles call after a picker selection.
//
// Auto-assigns Main (2026-09-13, direct request — "Set as Main" no
// longer exists as a way to reassign an already-linked image, so the
// artwork's very first image needs some way to become Main without a
// button). Whenever this artwork doesn't have a Main image yet, the
// first id in this batch becomes it. This is also exactly what makes
// "Delete & Replace" work (see deleteArtworkMainImage in imageDelete.ts):
// that clears mainImageId to null before deleting the old Main, so the
// next image linked here — the replacement the person just picked —
// automatically becomes the new Main.
export async function linkImagesToArtwork(artworkId: string, imageIds: string[], siteId: string) {
  const { artistId } = await artworkOwner(artworkId);
  // Only this client's own pictures (2026-10-26).
  await db.image.updateMany({
    where: { id: { in: imageIds }, artistId },
    data: { artworkId },
  });

  if (imageIds.length === 0) return;

  const artwork = await db.artwork.findUnique({
    where: { id: artworkId },
    select: { mainImageId: true },
  });
  if (!artwork?.mainImageId) {
    await db.artwork.update({ where: { id: artworkId }, data: { mainImageId: imageIds[0] } });
  }
}

export async function unlinkImageFromArtwork(artworkId: string, imageId: string, siteId: string) {
  await artworkOwner(artworkId);
  await db.image.updateMany({
    where: { id: imageId, artworkId },
    data: { artworkId: null },
  });
}

// "Delete & Replace" (2026-09-13, direct request) — the only way left to
// change a wrong Main image. Main is the artwork's image of record, so
// there's no swap-to-an-existing-image action any more — the old
// setMainImage action and ArtworkImageManager's "Set as Main" button are
// both removed; a wrong Main is deleted outright via
// deleteArtworkMainImage (imageDelete.ts), and its replacement becomes
// the new Main automatically once linked (see linkImagesToArtwork's
// auto-assign above).
export async function deleteArtworkMainImage(artworkId: string, imageId: string, siteId: string) {
  await artworkOwner(artworkId);
  return deleteArtworkMainImageInternal(artworkId, imageId);
}
