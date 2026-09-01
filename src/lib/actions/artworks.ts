"use server";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

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

// Wraps a create attempt with a short retry in case two artworks are
// created at the exact same instant and both compute the same next
// number — rare, but cheap to guard against. Exported (2026-08-11) so the
// CSV import reuses the exact same numbering logic — one shared counter,
// so manually-added and imported artworks can never collide.
export async function createArtworkWithRetry(
  artistId: string,
  data: Partial<{
    presentationTitle: string;
    catalogueName: string;
    presentationPrice: number | null;
    description: string | null;
    medium: string | null;
    presentationGroup: string | null;
    tier: string | null;
    availability: Availability;
    type: string | null;
    catalogueGroup: string | null;
    size: string | null;
    location: string | null;
    studioNotes: string | null;
    // Added (2026-08-18) for the Hopper's one-shot "Add Artwork" flow —
    // no prior caller needed Year at creation time, only updateCatalogue
    // (an in-place edit) did.
    year: number | null;
    // Optional (2026-08-17) — only the CSV import passes this true.
    // Regular "+ New" and duplicateArtwork both omit it, defaulting to
    // Prisma's own schema default (false) — see the matching note on
    // Artwork.needsReview in schema.prisma.
    needsReview: boolean;
  }> & { presentationTitle: string; catalogueName: string }
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalogueNumber = await nextCatalogueNumber(artistId);
    try {
      return await db.artwork.create({
        data: { artistId, catalogueNumber, ...data },
      });
    } catch (err: unknown) {
      const isUniqueViolation =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw err;
    }
  }
  throw new Error("Could not generate a unique catalogue number.");
}

// "+ New" — a Title is optional. If left blank the record is created as
// "Untitled" so you can jump straight in and upload an image first, name
// it later. Whatever title it ends up with seeds both facets
// (presentationTitle and catalogueName) as a starting point; from this
// point on the two are independent.
// `siteId` here is only which site you're currently working in, so the
// new artwork's editor opens back on that site's URL — it doesn't scope
// ownership, `artistId` does.
export async function createArtwork(artistId: string, siteId: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim() || "Untitled";

  const artwork = await createArtworkWithRetry(artistId, {
    presentationTitle: title,
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
// row, but they can cheaply share the same underlying file. This is
// exactly what avoids the "upload the same photo again" confusion this
// feature exists to prevent — and, since 2026-08-28, is also the
// intended way to represent the same piece offered both framed and
// unframed: two separate Catalogue entries, each with its own single
// price, rather than one entry with two prices.
//
// Deliberately reset rather than copied:
// - Availability always starts AVAILABLE, regardless of the original's
//   current status — a derivative is a distinct, not-yet-sold listing,
//   even if the original it was copied from has since sold.
// - No Purchase/sale history is copied — a derivative has never been
//   sold itself.
// - A fresh catalogueNumber is generated the normal way (nextCatalogueNumber,
//   via createArtworkWithRetry) — never reuses the original's number.
export async function duplicateArtwork(artworkId: string, siteId: string) {
  const original = await db.artwork.findUniqueOrThrow({
    where: { id: artworkId },
    include: { images: true, saleTerms: true },
  });

  const created = await createArtworkWithRetry(original.artistId, {
    presentationTitle: `${original.presentationTitle} Derivative`,
    catalogueName: `${original.catalogueName} Derivative`,
    presentationPrice:
      original.presentationPrice != null ? Number(original.presentationPrice) : null,
    description: original.description,
    medium: original.medium,
    presentationGroup: original.presentationGroup,
    tier: original.tier,
    availability: "AVAILABLE",
    type: original.type,
    catalogueGroup: original.catalogueGroup,
    size: original.size,
    location: original.location,
    studioNotes: original.studioNotes,
  });

  // Fields createArtworkWithRetry's signature doesn't cover (added to the
  // schema after that helper was written for the plain "+ New" flow) —
  // a follow-up update rather than extending that shared signature, to
  // avoid changing behaviour for its other caller (CSV import).
  await db.artwork.update({
    where: { id: created.id },
    data: {
      year: original.year,
      edition: original.edition,
      availableQty: original.availableQty,
      offeredPrice: original.offeredPrice,
      presentationMedium: original.presentationMedium,
      viewingLocation: original.viewingLocation,
    },
  });

  // Copy Sale Terms too, not just presentationPrice — so the derivative
  // is immediately ready to sell (Payment tab checks for a SaleTerms row
  // existing before it will start a Stripe/Gallery sale) rather than
  // silently needing an extra visit-and-resave of Presentation first.
  if (original.saleTerms) {
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

type ListFilters = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
  // Pagination — added 2026-08-11 once the catalogue reached real size
  // (~150 artworks after the CSV import). Previously fetched every
  // matching row unconditionally, every time, the same issue already
  // fixed on Media Catalogue.
  offset?: number;
  limit?: number;
};

const DEFAULT_PAGE_SIZE = 60;

// Powers the "raw import" count shown next to Artwork Catalogue in the
// nav (2026-08-17) — see the matching note on Artwork.needsReview in
// schema.prisma for exactly what sets/clears this.
//
// Also part of the shared site layout (src/app/sites/[id]/layout.tsx),
// which re-runs this on every navigation inside a site. Cached for 60s
// per artist (2026-08-31) — same reasoning as the hopper/bucket counts
// and getOpenAlerts: cheap on its own, but adds up when paid on every
// click, and doesn't need second-level freshness.
const countArtworksNeedingReviewCached = unstable_cache(
  async (artistId: string) => db.artwork.count({ where: { artistId, needsReview: true } }),
  ["count-artworks-needing-review"],
  { revalidate: 60 }
);

export async function countArtworksNeedingReview(artistId: string): Promise<number> {
  return countArtworksNeedingReviewCached(artistId);
}

// Lightweight rows for the grid — only what a tile needs to render.
// Full detail is fetched separately (getArtworkDetail) when a tile is opened.
export async function listArtworks(artistId: string, filters: ListFilters) {
  const { offset = 0, limit = DEFAULT_PAGE_SIZE } = filters;

  const orderBy = buildArtworkOrderBy(filters.sort);
  const where = buildArtworkWhere(artistId, filters);

  const [rows, total, soldCount] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy,
      select: {
        id: true,
        presentationTitle: true,
        catalogueName: true,
        presentationPrice: true,
        catalogueNumber: true,
        availability: true,
        type: true,
        catalogueGroup: true,
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
    // happened to be on the current page.
    db.artwork.count({ where: { ...where, availability: "SOLD" } }),
  ]);

  // Prefer the small thumbnail (fast, served straight from storage) —
  // falls back to the original proxied url for any image uploaded before
  // 2026-08-13 that hasn't been backfilled yet, so nothing breaks or goes
  // blank in the meantime.
  //
  // Folds mainImage into the same images[0] slot every existing caller
  // already reads (2026-08-16), rather than changing what shape callers
  // expect — an artwork with a chosen main image shows that one; anything
  // without one falls back to whatever Prisma returned first, same as
  // before this existed.
  const rowsWithThumbnails = rows.map(({ mainImage, images, ...rest }) => {
    const effectiveImage = mainImage || images[0] || null;
    return {
      ...rest,
      images: effectiveImage
        ? [{ url: publicMediaUrl(effectiveImage.thumbnailKey) || effectiveImage.url }]
        : [],
    };
  });

  return { rows: rowsWithThumbnails, total, soldCount };
}

// Full record for the slide-in detail panel — both facets, all images.
export async function getArtworkDetail(id: string) {
  const result = await db.artwork.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: {
      images: true,
      saleTerms: true,
      purchases: {
        include: { payments: { orderBy: { sequence: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
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
  const artwork = await getArtworkDetail(id);
  if (!artwork) return null;

  const purchases = artwork.purchases.map((p) => ({
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
    invoiceNumber: p.invoiceNumber,
    // Part Three (2026-09-01) — see the matching schema.prisma comments.
    stripePaymentLinkUrl: p.stripePaymentLinkUrl,
    invoiceEmailedAt: p.invoiceEmailedAt ? p.invoiceEmailedAt.toISOString() : null,
    invoiceEmailedTo: p.invoiceEmailedTo,
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
    })),
  }));

  return {
    id: artwork.id,
    artistId: artwork.artistId,
    catalogueNumber: artwork.catalogueNumber,
    presentationTitle: artwork.presentationTitle,
    presentationPrice: artwork.presentationPrice != null ? artwork.presentationPrice.toString() : null,
    description: artwork.description,
    medium: artwork.medium,
    presentationMedium: artwork.presentationMedium,
    viewingLocation: artwork.viewingLocation,
    presentationGroup: artwork.presentationGroup,
    availability: artwork.availability,
    visible: artwork.visible,
    catalogueName: artwork.catalogueName,
    year: artwork.year,
    type: artwork.type,
    catalogueGroup: artwork.catalogueGroup,
    size: artwork.size,
    location: artwork.location,
    edition: artwork.edition,
    availableQty: artwork.availableQty,
    offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
    studioNotes: artwork.studioNotes,
    images: artwork.images
      .slice()
      .sort((a, b) => {
        // Main image first, if one is set — everything else keeps
        // whatever order Prisma returned (2026-08-16).
        if (a.id === artwork.mainImageId) return -1;
        if (b.id === artwork.mainImageId) return 1;
        return 0;
      })
      .map((img) => ({
        id: img.id,
        url: publicMediaUrl(img.thumbnailKey) || img.url,
        // Larger version for the enlarged preview (2026-08-16) — the
        // thumbnail above is deliberately small (600px) for a snappy
        // strip of many of them; this is the 1800px one, still much
        // smaller than the true original but plenty for an on-screen
        // preview.
        displayUrl: publicMediaUrl(img.displayKey) || publicMediaUrl(img.thumbnailKey) || img.url,
        kind: img.kind,
        posterUrl: img.posterUrl,
      })),
    saleTerms: artwork.saleTerms
      ? {
          totalAmount: artwork.saleTerms.totalAmount.toString(),
          currency: artwork.saleTerms.currency,
          instalmentCount: artwork.saleTerms.instalmentCount,
          releaseMessage: artwork.saleTerms.releaseMessage,
          releaseTriggerCount: artwork.saleTerms.releaseTriggerCount,
        }
      : null,
    activePurchase: purchases.find((p) => p.status === "ACTIVE") || null,
    purchaseHistory: purchases.filter((p) => p.status !== "ACTIVE"),
  };
}

// `siteId` is only used to revalidate/redirect back to whichever site's
// screen you were editing from — it no longer scopes the artwork itself.
export async function updatePresentation(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const presentationTitle = (formData.get("presentationTitle") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  // Presentation's own Medium wording and "Can be viewed at"
  // (2026-08-28) — both are seeded once from Catalogue (Medium from
  // Catalogue's `medium`, Can be viewed at from Catalogue's `location`)
  // in updateCatalogue below, then independent from here on.
  const presentationMedium = (formData.get("presentationMedium") as string)?.trim() || null;
  const viewingLocation = (formData.get("viewingLocation") as string)?.trim() || null;
  // Price is no longer typed on this tab at all (2026-08-28) — it's a
  // read-only mirror of Catalogue's Offered price, written only from
  // updateCatalogue. Framed price and the per-artwork Release message/
  // Release-after fields are gone from this form the same way — see the
  // matching schema.prisma comments.

  await db.artwork.update({
    where: { id },
    data: {
      presentationTitle,
      description,
      presentationMedium,
      viewingLocation,
      // Cleared on any real save here — this tab (or Catalogue) being
      // saved at all is exactly "reviewed and edited" for the purposes
      // of the raw-import count next to Artwork Catalogue in the nav
      // (2026-08-17). Harmless to also clear it for an artwork that was
      // never flagged in the first place — it's already false.
      needsReview: false,
    },
  });

}

export async function updateCatalogue(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const catalogueName = (formData.get("catalogueName") as string)?.trim();
  const yearRaw = (formData.get("year") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const catalogueGroup = (formData.get("catalogueGroup") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const edition = (formData.get("edition") as string)?.trim() || null;
  const availableQtyRaw = (formData.get("availableQty") as string)?.trim();
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  const availability = formData.get("availability") as Availability;
  // The actual asking price (2026-08-28), replacing the old "Catalogue
  // holds no price" rule now that Offered price is the one place price
  // is typed at all.
  const offeredPriceRaw = (formData.get("offeredPrice") as string)?.trim();

  // Presentation's Title still defaults from Catalogue's Name,
  // Presentation's own Medium defaults from Catalogue's Medium, and (new,
  // 2026-08-28 follow-up) Presentation's "Can be viewed at" defaults from
  // Catalogue's Location — but only the first time each is actually
  // filled in, and only while Presentation is still at its untouched
  // default. The moment someone types something different directly into
  // Presentation, it's considered overridden and this stops touching
  // that field — "seed once, then independent," same pattern used for
  // all three.
  const current = await db.artwork.findUnique({
    where: { id },
    select: { presentationTitle: true, presentationMedium: true, viewingLocation: true },
  });

  const presentationUpdate: {
    presentationTitle?: string;
    presentationMedium?: string;
    viewingLocation?: string;
  } = {};
  if (current?.presentationTitle === "Untitled" && catalogueName) {
    presentationUpdate.presentationTitle = catalogueName;
  }
  if (!current?.presentationMedium && medium) {
    presentationUpdate.presentationMedium = medium;
  }
  if (!current?.viewingLocation && location) {
    presentationUpdate.viewingLocation = location;
  }

  await db.artwork.update({
    where: { id },
    data: {
      catalogueName,
      year: yearRaw ? parseInt(yearRaw, 10) : null,
      type,
      catalogueGroup,
      size,
      location,
      edition,
      availableQty: availableQtyRaw ? parseInt(availableQtyRaw, 10) : null,
      studioNotes,
      medium,
      availability,
      offeredPrice: offeredPriceRaw || null,
      // Mirrors into Presentation's Price (2026-08-28) — see the note on
      // Artwork.presentationPrice in schema.prisma for why this stays a
      // real synced column rather than every consumer re-plumbed to read
      // offeredPrice directly.
      presentationPrice: offeredPriceRaw || null,
      // See the matching note in updatePresentation above.
      needsReview: false,
      ...presentationUpdate,
    },
  });

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
  const artwork = await db.artwork.findUnique({
    where: { id: artworkId },
    include: { images: true, saleTerms: true, purchases: true },
    relationLoadStrategy: "query",
  });
  if (!artwork) return;

  const isBlank =
    artwork.presentationTitle === "Untitled" &&
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
    !artwork.presentationGroup &&
    !artwork.year &&
    !artwork.type &&
    !artwork.catalogueGroup &&
    !artwork.size &&
    !artwork.location &&
    !artwork.edition &&
    !artwork.availableQty &&
    !artwork.studioNotes;

  if (!isBlank) return;

  await db.artwork.delete({ where: { id: artworkId } });
}

export async function deleteArtwork(siteId: string, id: string) {
  await db.artwork.delete({ where: { id } });
}

export async function linkImagesToArtwork(artworkId: string, imageIds: string[], siteId: string) {
  await db.image.updateMany({
    where: { id: { in: imageIds } },
    data: { artworkId },
  });
}

export async function unlinkImageFromArtwork(artworkId: string, imageId: string, siteId: string) {
  await db.image.update({
    where: { id: imageId },
    data: { artworkId: null },
  });
}

// Which of an artwork's images/videos shows first everywhere it's
// represented by a single thumbnail (2026-08-16) — set by dragging one
// to the front of the strip in the editor. Deliberately just this one
// field rather than persisting a full custom order for every image:
// only "which one is the main one" has meaning outside the editor
// itself.
export async function setMainImage(artworkId: string, siteId: string, imageId: string) {
  await db.artwork.update({
    where: { id: artworkId },
    data: { mainImageId: imageId },
  });
}

// Used to hydrate a Section's saved artwork grid — Prisma's `in` filter
// doesn't preserve order, so the results are re-sorted to match the saved
// artworkIds order before returning.
export async function getArtworksByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.artwork.findMany({
    where: { id: { in: ids } },
    include: { images: { take: 1 }, mainImage: true },
    relationLoadStrategy: "query",
  });
  const byId = new Map(rows.map((a) => [a.id, a]));
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map(({ mainImage, images, ...a }) => {
      // Folds mainImage into the same images[0] slot every consumer
      // already reads (2026-08-16, same pattern as listArtworks) — used
      // by both the Section editor's saved artwork grid and the page
      // preview's Section-type rendering.
      const effectiveImages = mainImage ? [mainImage, ...images.filter((i) => i.id !== mainImage.id)] : images;
      return {
        ...a,
        presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
        images: effectiveImages.map((img) => ({
          ...img,
          url: publicMediaUrl(img.thumbnailKey) || img.url,
        })),
      };
    });
}
