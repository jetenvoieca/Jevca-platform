"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

// Artworks belong to the Artist, not any one Site — the same piece can be
// featured on more than one of that artist's sites. Actions here take an
// explicit `siteId` only where it's needed to know which site's URL to
// redirect to or revalidate — never to scope which artworks are returned.

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
    dimensions: string | null;
    description: string | null;
    medium: string | null;
    presentationGroup: string | null;
    tier: string | null;
    availability: Availability;
    type: string | null;
    catalogueGroup: string | null;
    size: string | null;
    location: string | null;
    priceUnframed: number | null;
    studioNotes: string | null;
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

// Lightweight rows for the grid — only what a tile needs to render.
// Full detail is fetched separately (getArtworkDetail) when a tile is opened.
export async function listArtworks(artistId: string, filters: ListFilters) {
  const { q, availability, location, type, group, sort, offset = 0, limit = DEFAULT_PAGE_SIZE } =
    filters;

  const orderBy = {
    presentationPrice: sort === "price" ? ("desc" as const) : undefined,
    presentationTitle: sort === "title" ? ("asc" as const) : undefined,
    createdAt: sort === "price" || sort === "title" ? undefined : ("desc" as const),
  };

  const where = {
    artistId,
    ...(q
      ? {
          OR: [
            { presentationTitle: { contains: q, mode: "insensitive" as const } },
            { catalogueName: { contains: q, mode: "insensitive" as const } },
            { catalogueNumber: { contains: q, mode: "insensitive" as const } },
            { medium: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(availability ? { availability: availability as Availability } : {}),
    ...(location ? { location } : {}),
    ...(type ? { type } : {}),
    // A Group filter matches either facet's Group, since the same preset
    // list feeds both and it's not obvious to the user which one a given
    // artwork was tagged under.
    ...(group ? { OR: [{ catalogueGroup: group }, { presentationGroup: group }] } : {}),
  };

  const [rows, total, soldCount] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy,
      select: {
        id: true,
        presentationTitle: true,
        presentationPrice: true,
        catalogueNumber: true,
        availability: true,
        images: { take: 1, select: { url: true } },
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

  return { rows, total, soldCount };
}

// Full record for the slide-in detail panel — both facets, all images.
export async function getArtworkDetail(id: string) {
  // TEMPORARY DIAGNOSTIC LOGGING (2026-08-12) — tracking down a reported
  // 2-3 second delay on artwork selection. Remove once the cause is
  // confirmed and fixed; not meant to stay long-term.
  const t0 = Date.now();
  const result = await db.artwork.findUnique({
    where: { id },
    include: {
      images: true,
      saleTerms: true,
      purchases: {
        include: { payments: { orderBy: { sequence: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  console.log(`[TIMING] getArtworkDetail(${id}): ${Date.now() - t0}ms`);
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
  // TEMPORARY DIAGNOSTIC LOGGING (2026-08-12) — see matching note on
  // getArtworkDetail above. This wraps the whole function so we can see
  // total server-side time vs. just the database query time.
  const tStart = Date.now();
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
    source: p.source,
    commissionPercent: p.commissionPercent != null ? p.commissionPercent.toString() : null,
    invoiceNumber: p.invoiceNumber,
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

  console.log(`[TIMING] getArtworkDetailForClient(${id}) total: ${Date.now() - tStart}ms`);

  return {
    id: artwork.id,
    artistId: artwork.artistId,
    catalogueNumber: artwork.catalogueNumber,
    presentationTitle: artwork.presentationTitle,
    presentationPrice: artwork.presentationPrice != null ? artwork.presentationPrice.toString() : null,
    dimensions: artwork.dimensions,
    description: artwork.description,
    medium: artwork.medium,
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
    priceUnframed: artwork.priceUnframed != null ? artwork.priceUnframed.toString() : null,
    priceFramed: artwork.priceFramed != null ? artwork.priceFramed.toString() : null,
    studioNotes: artwork.studioNotes,
    images: artwork.images.map((img) => ({
      id: img.id,
      url: img.url,
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
  const priceRaw = (formData.get("presentationPrice") as string)?.trim();
  const dimensions = (formData.get("dimensions") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;

  await db.artwork.update({
    where: { id },
    data: {
      presentationTitle,
      presentationPrice: priceRaw || null,
      dimensions,
      description,
      // Medium and Group are no longer editable from here — both now
      // read-only, live-mirroring Catalogue's `medium` and
      // `catalogueGroup` (edited only from the Catalogue tab). The
      // `presentationGroup` column itself is left in the database
      // untouched rather than dropped, in case a genuinely independent
      // public-facing Group value is ever wanted again — same reasoning
      // as the kept-but-unused `visible` column.
      //
      // Availability moved to the Catalogue tab — it's part of the
      // artist's own working record, not something typed while looking at
      // "what customers see." Visibility is deliberately not set here
      // either — it'll be governed by which pages feature the artwork,
      // not a manual toggle on this screen. The column stays in the
      // database (untouched, whatever it was) rather than being dropped,
      // to avoid a destructive migration for a field that may be wanted
      // again.
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
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
  const priceUnframedRaw = (formData.get("priceUnframed") as string)?.trim();
  const priceFramedRaw = (formData.get("priceFramed") as string)?.trim();
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  const availability = formData.get("availability") as Availability;

  // Presentation's Title, Price, and Dimensions default from Catalogue's
  // Name, Price unframed, and Size — but only the first time Catalogue is
  // actually filled in, and only while Presentation is still at its
  // untouched default. The moment someone types something different
  // directly into Presentation, it's considered overridden and this stops
  // touching that field — same "seed once, then independent" pattern
  // already used for Presentation being seeded from Catalogue at
  // creation.
  const current = await db.artwork.findUnique({
    where: { id },
    select: { presentationTitle: true, presentationPrice: true, dimensions: true },
  });

  const presentationUpdate: {
    presentationTitle?: string;
    presentationPrice?: string | null;
    dimensions?: string;
  } = {};
  if (current?.presentationTitle === "Untitled" && catalogueName) {
    presentationUpdate.presentationTitle = catalogueName;
  }
  if (current?.presentationPrice == null && priceUnframedRaw) {
    presentationUpdate.presentationPrice = priceUnframedRaw;
  }
  if (!current?.dimensions && size) {
    presentationUpdate.dimensions = size;
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
      priceUnframed: priceUnframedRaw || null,
      priceFramed: priceFramedRaw || null,
      studioNotes,
      medium,
      availability,
      ...presentationUpdate,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
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
  });
  if (!artwork) return;

  const isBlank =
    artwork.presentationTitle === "Untitled" &&
    artwork.catalogueName === "Untitled" &&
    artwork.images.length === 0 &&
    !artwork.saleTerms &&
    artwork.purchases.length === 0 &&
    !artwork.presentationPrice &&
    !artwork.dimensions &&
    !artwork.description &&
    !artwork.medium &&
    !artwork.presentationGroup &&
    !artwork.year &&
    !artwork.type &&
    !artwork.catalogueGroup &&
    !artwork.size &&
    !artwork.location &&
    !artwork.edition &&
    !artwork.availableQty &&
    !artwork.priceUnframed &&
    !artwork.priceFramed &&
    !artwork.studioNotes;

  if (!isBlank) return;

  await db.artwork.delete({ where: { id: artworkId } });
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function deleteArtwork(siteId: string, id: string) {
  await db.artwork.delete({ where: { id } });
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function linkImagesToArtwork(artworkId: string, imageIds: string[], siteId: string) {
  await db.image.updateMany({
    where: { id: { in: imageIds } },
    data: { artworkId },
  });
  revalidatePath(`/sites/${siteId}/artworks`);
}

export async function unlinkImageFromArtwork(artworkId: string, imageId: string, siteId: string) {
  await db.image.update({
    where: { id: imageId },
    data: { artworkId: null },
  });
  revalidatePath(`/sites/${siteId}/artworks`);
}

// Used to hydrate a Section's saved artwork grid — Prisma's `in` filter
// doesn't preserve order, so the results are re-sorted to match the saved
// artworkIds order before returning.
export async function getArtworksByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.artwork.findMany({
    where: { id: { in: ids } },
    include: { images: { take: 1 } },
  });
  const byId = new Map(rows.map((a) => [a.id, a]));
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => ({
      ...a,
      presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    }));
}
