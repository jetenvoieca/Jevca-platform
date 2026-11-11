"use server";

import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { retireArtworkPaymentLinks, saleInvoicesInclude, toSaleInvoices } from "@/lib/invoices";
import { publicMediaUrl } from "@/lib/r2";
import {
  buildArtworkWhere,
  buildArtworkOrderBy,
  ARTWORK_SORT_CURATION,
  isSold,
  SOLD_AVAILABILITIES,
  type ArtworkFilterInput,
} from "@/lib/artworkFilters";
import { isCurrency } from "@/lib/currencies";
import { formatEdition, isOpenEditionType, isOriginalType, parseEdition } from "@/lib/derivatives";
import { inIdOrder, orderByCuration } from "@/lib/artworkOrder";
import { ARTWORK_IMAGE_SELECT, toArtworkImage } from "@/lib/artworkImages";
import { getArtistDefaultCurrency } from "@/lib/primarySite";
import type { PurchaseDetail } from "./payments";
import { isSaleOverdue, overdueInvoiceSelect } from "@/lib/overdue";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

// Artworks belong to the Artist, not any one Site — the same piece can be
// featured on more than one of that artist's sites. A `siteId` some
// actions take never scopes which artworks are returned.
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
// pure downside for that flow.

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
    // A Base work (2026-11-01 — the Hopper's form can tick it too).
    isBase: boolean;
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

// "Create Derivative" (2026-08-16) — for when the same physical piece
// legitimately exists as more than one sellable listing (e.g. an
// Original alongside a Paper Edition of it, or the same image reused for
// a different size option). Duplicates the Catalogue fields, Presentation
// fields (including pricing, so it's immediately sellable — not left
// needing a re-save before Payment will accept a sale), and its picture.
//
// The picture is copied as a new `Image` row pointing at the exact same
// stored file (same `key`/`url`/thumbnailKey/displayKey), not re-uploaded
// — a picture is the main picture of one work only, so two works can
// never share one row, but they can cheaply share the same file (which
// deleteImageFiles leaves in place while another row still uses it).
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
//   the name (and the Type and edition chosen) is left blank on the new
//   derivative. The whole point of
//   deriving from a one-off piece is a genuinely fresh sellable listing
//   (e.g. a print edition made from an original painting), not a copy of
//   details that don't apply to it.
// - Anything else (typically an edition) — every field is carried over
//   unchanged, same as before this change, EXCEPT Location (always
//   blank — a new edition print isn't automatically sitting wherever the
//   original is).
//
// Its Type and edition are chosen first (2026-11-05, Craig's mockup — see
// lib/derivatives.ts): any Type but an Original; for a numbered edition
// (not an open one) its number of how many, a number not already taken
// by another derivative of this work of that Type.
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
//
// Only from a Base work (2026-11-01, Craig's request — see
// Artwork.isBase).
export async function duplicateArtwork(
  artworkId: string,
  siteId: string,
  choice: { type: string; number: number | null; size: number | null }
): Promise<{ id: string } | { error: string }> {
  await artworkOwner(artworkId);
  const original = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    include: { mainImage: true, saleTerms: true },
  });
  if (!original.isBase) return { error: "Tick Base first — derivatives are made from a Base work." };

  const newType = choice.type.trim();
  if (!newType || isOriginalType(newType)) return { error: "Choose the derivative's Type (not an Original)." };
  let newEdition: string | null = null;
  if (!isOpenEditionType(newType)) {
    const { number, size } = choice;
    if (!Number.isInteger(number) || !Number.isInteger(size) || number! < 1 || size! < 1) {
      return { error: "Give its number and the size of the edition, e.g. 3 of 10." };
    }
    if (number! > size!) return { error: `Its number can't be more than ${size}.` };
    const siblings = await db.artwork.findMany({
      where: { derivedFromId: original.id, type: newType },
      select: { edition: true },
    });
    if (siblings.some((d) => parseEdition(d.edition)?.number === number)) {
      return { error: `Number ${number} of this edition is already in the catalogue.` };
    }
    newEdition = formatEdition(number!, size!);
  }

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
    type: newType,
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
      edition: newEdition,
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

  const img = original.mainImage;
  if (img) {
    const copy = await db.image.create({
      data: {
        artistId: original.artistId,
        key: img.key,
        url: img.url,
        thumbnailKey: img.thumbnailKey,
        displayKey: img.displayKey,
        squareKey: img.squareKey,
        posterUrl: img.posterUrl,
        kind: img.kind,
        mimeType: img.mimeType,
        caption: img.caption,
        altText: img.altText,
        tags: img.tags,
        status: img.status,
        source: img.source,
      },
    });
    await db.artwork.update({ where: { id: created.id }, data: { mainImageId: copy.id } });
  }

  return { id: created.id };
}

// A Base work's derivatives by Type (2026-11-05, Craig's mockup): for
// the Make Derivative window, each Type's edition size and the numbers
// already made (sold ones too); for View Derivatives, the unsold ones —
// numbered ones in number order — with where each is. Sold ones are left
// out of that list: it's for keeping track of unsold stock.
export type DerivativeGroup = {
  type: string;
  open: boolean;
  size: number | null;
  usedNumbers: number[];
  unsold: { id: string; number: number | null; edition: string | null; location: string | null }[];
};

export async function listDerivatives(artworkId: string): Promise<DerivativeGroup[]> {
  await artworkOwner(artworkId);
  const rows = await db.artwork.findMany({
    where: { derivedFromId: artworkId },
    select: { id: true, type: true, edition: true, location: true, availability: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, DerivativeGroup>();
  for (const row of rows) {
    const type = row.type?.trim() || "No type";
    const group: DerivativeGroup = groups.get(type) ?? { type, open: isOpenEditionType(type), size: null, usedNumbers: [], unsold: [] };
    groups.set(type, group);
    const parsed = parseEdition(row.edition);
    if (parsed) {
      group.size ??= parsed.size;
      group.usedNumbers.push(parsed.number);
    }
    if (!isSold(row.availability)) {
      group.unsold.push({ id: row.id, number: parsed?.number ?? null, edition: row.edition, location: row.location });
    }
  }
  for (const group of groups.values()) {
    group.usedNumbers.sort((a, b) => a - b);
    group.unsold.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type));
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
  // A Base work (see Artwork.isBase).
  isBase: boolean;
  availability: string;
  type: string | null;
  // Shown under a tile while the catalogue is filtered, and in the list
  // (2026-11-05).
  edition: string | null;
  location: string | null;
  // The curations it's in, by name (the list, 2026-11-05).
  curations: string[];
  imageUrl: string | null;
};

// Every distinct artwork name for the artist, A–Z the same way the grid
// sorts (natural-language collation, see buildArtworkOrderBy) — the
// Artwork Catalogue's Name dropdown (2026-10-13) — with how many works
// have each name (2026-11-05, Craig's request).
export type ArtworkNameCount = { name: string; count: number };

export async function listArtworkNames(artistId: string): Promise<ArtworkNameCount[]> {
  await requireArtistAccess(artistId);
  const rows = await db.artwork.groupBy({
    by: ["catalogueName"],
    where: { artistId },
    orderBy: { catalogueName: "asc" },
    _count: { _all: true },
  });
  return rows.map((r) => ({ name: r.catalogueName, count: r._count._all }));
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
  // By Curation (2026-11-06), this page's works are picked from the
  // whole filtered set put in that order.
  const byCuration = filters.sort === ARTWORK_SORT_CURATION;
  const curationIds = byCuration ? await orderByCuration(where) : null;

  const [found, total, soldCount] = await Promise.all([
    db.artwork.findMany({
      where: curationIds ? { id: { in: curationIds.slice(offset, offset + limit) } } : where,
      orderBy,
      select: {
        id: true,
        catalogueName: true,
        presentationPrice: true,
        catalogueNumber: true,
        isBase: true,
        availability: true,
        type: true,
        edition: true,
        location: true,
        mainImage: { select: { url: true, thumbnailKey: true } },
        curationItems: { select: { curation: { select: { name: true } } } },
      },
      ...(curationIds ? {} : { skip: offset, take: limit }),
    }),
    curationIds ? curationIds.length : db.artwork.count({ where }),
    // Over the whole filtered set, not just this page — otherwise the
    // "X sold" summary would silently only ever reflect whatever
    // happened to be on the current page. Includes RESERVED ("Sold -
    // Not Paid"), same as the Sold filter — see SOLD_AVAILABILITIES.
    db.artwork.count({ where: { ...where, availability: { in: SOLD_AVAILABILITIES } } }),
  ]);

  // Prefers the small thumbnail (fast, served straight from storage) —
  // falls back to the original proxied url for any image uploaded before
  // 2026-08-13 that hasn't been backfilled yet, so nothing breaks or goes
  // blank in the meantime.
  const rows = curationIds ? inIdOrder(found, curationIds) : found;
  const listRows: ArtworkListRow[] = rows.map(({ mainImage, presentationPrice, curationItems, ...rest }) => ({
    ...rest,
    curations: curationItems.map((i) => i.curation.name).sort((a, b) => a.localeCompare(b)),
    presentationPrice: presentationPrice != null ? presentationPrice.toString() : null,
    imageUrl: mainImage ? publicMediaUrl(mainImage.thumbnailKey) || mainImage.url : null,
  }));

  return { rows: listRows, total, soldCount };
}

// Full record for the slide-in detail panel — both facets and its picture.
async function getArtworkDetail(id: string) {
  await artworkOwner(id);
  const result = await db.artwork.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: {
      mainImage: { select: ARTWORK_IMAGE_SELECT },
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
      derivedFrom: { select: { catalogueNumber: true, isBase: true } },
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
    isBase: artwork.isBase,
    // "Derived from #..." (2026-09-11) — null for any artwork that
    // isn't itself a derivative. See the matching note on
    // Artwork.derivedFromId in schema.prisma.
    derivedFromCatalogueNumber: artwork.derivedFrom?.catalogueNumber ?? null,
    derivedFromIsBase: artwork.derivedFrom?.isBase ?? false,
    // The work's one picture (2026-10-28).
    mainImage: artwork.mainImage ? toArtworkImage(artwork.mainImage) : null,
    activePurchase: purchases.find((p) => p.status === "ACTIVE") || null,
    purchaseHistory: purchases.filter((p) => p.status !== "ACTIVE"),
  };
}

export async function updateCatalogue(
  id: string,
  siteId: string,
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const { artistId } = await artworkOwner(id);
  const catalogueName = (formData.get("catalogueName") as string)?.trim();
  const dateRaw = (formData.get("date") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const edition = (formData.get("edition") as string)?.trim() || null;
  const availableQtyRaw = (formData.get("availableQty") as string)?.trim();
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  // The Base tick box, in Studio notes (2026-11-01).
  const isBase = formData.get("isBase") === "on";
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
    select: { catalogueName: true, viewingLocation: true, derivedFromId: true },
  });

  // A numbered edition (2026-11-11, Craig): its number no more than the
  // edition's size, and not one another work of the same edition has —
  // the same Base work's derivatives of that Type, or for a work not
  // made from one, works of the same name and Type. Nothing is saved
  // otherwise.
  const numbered = parseEdition(edition);
  if (numbered && type) {
    if (numbered.number > numbered.size) return { error: `Its number can't be more than ${numbered.size}.` };
    const others = await db.artwork.findMany({
      where: {
        artistId,
        id: { not: id },
        type,
        ...(current?.derivedFromId ? { derivedFromId: current.derivedFromId } : { derivedFromId: null, catalogueName }),
      },
      select: { edition: true },
    });
    if (others.some((o) => parseEdition(o.edition)?.number === numbered.number)) {
      return { error: `Number ${numbered.number} of this edition is already in the catalogue.` };
    }
  }

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
      isBase,
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
  return { ok: true };
}

// Marks a work as a Base work (2026-11-11 — the Artist App's Make Edition,
// before its edition is made).
export async function setArtworkBase(id: string): Promise<void> {
  await artworkOwner(id);
  await db.artwork.update({ where: { id }, data: { isBase: true } });
}

// Just the work's Location (2026-11-05 — set from View Derivatives on a
// derivative that has none), seeding the website's "Can be viewed at"
// the same way a Catalogue save does.
export async function setArtworkLocation(id: string, location: string): Promise<{ ok: true } | { error: string }> {
  const { artistId } = await artworkOwner(id);
  const name = location.trim();
  const known = await db.location.findFirst({ where: { artistId, name }, select: { id: true } });
  if (!known) return { error: "Choose one of your Locations." };
  const current = await db.artwork.findUnique({ where: { id }, select: { viewingLocation: true } });
  await db.artwork.update({
    where: { id },
    data: { location: name, ...(current?.viewingLocation ? {} : { viewingLocation: name }) },
  });
  return { ok: true };
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
    include: { saleTerms: true, purchases: true },
    relationLoadStrategy: "query",
  });
  if (!artwork) return;

  const isBlank =
    artwork.catalogueName === "Untitled" &&
    !artwork.mainImageId &&
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

// Deletes a work — its curation places and sale terms go with it, its
// picture stays in the Media Catalogue and its derivatives just lose the
// link. A work with sales recorded isn't deleted (2026-11-06): its sales
// would go too.
export async function deleteArtwork(siteId: string, id: string): Promise<{ ok: true } | { error: string }> {
  await artworkOwner(id);
  const sales = await db.purchase.count({ where: { artworkId: id } });
  if (sales > 0) {
    return {
      error: `This work has ${sales === 1 ? "a sale" : `${sales} sales`} recorded, so it can't be deleted. If it's a duplicate, delete the other copy instead.`,
    };
  }
  await db.artwork.delete({ where: { id } });
  return { ok: true };
}

// The artwork's one picture (2026-10-28, Craig: the Catalogue is a plain
// record of the works — other pictures belong to curations'
// presentations): this Media Catalogue picture becomes its Main, and the
// one it replaces stays in the Media Catalogue.
export async function setArtworkMainImage(
  artworkId: string,
  imageId: string,
): Promise<{ ok: true } | { error: string }> {
  const { artistId } = await artworkOwner(artworkId);
  const image = await db.image.findFirst({
    where: { id: imageId, artistId },
    select: { kind: true, mainImageOfArtwork: { select: { id: true } } },
  });
  if (!image) return { error: "That picture wasn't found." };
  if (image.kind !== "PHOTO") return { error: "Choose a picture, not a video." };
  if (image.mainImageOfArtwork && image.mainImageOfArtwork.id !== artworkId) {
    return { error: "That picture is already another work's main picture." };
  }
  const artwork = await db.artwork.findUnique({ where: { id: artworkId }, select: { mainImageId: true } });
  if (artwork?.mainImageId === imageId) return { ok: true };
  await db.$transaction([
    db.artwork.update({ where: { id: artworkId }, data: { mainImageId: imageId } }),
    db.image.update({ where: { id: imageId }, data: { status: "SORTED" } }),
  ]);
  return { ok: true };
}

