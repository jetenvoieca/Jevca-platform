"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

async function nextCatalogueNumber(siteId: string) {
  // Based on the highest catalogue number actually in use, not the row
  // count — count() breaks the moment any artwork is ever deleted, since
  // the count drops but a surviving artwork can still hold a higher
  // number, causing the next "count + 1" guess to collide with it.
  const rows = await db.artwork.findMany({
    where: { siteId },
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
// number — rare, but cheap to guard against.
async function createArtworkWithRetry(
  siteId: string,
  data: { presentationTitle: string; catalogueName: string }
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalogueNumber = await nextCatalogueNumber(siteId);
    try {
      return await db.artwork.create({
        data: { siteId, catalogueNumber, ...data },
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
export async function createArtwork(siteId: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim() || "Untitled";

  const artwork = await createArtworkWithRetry(siteId, {
    presentationTitle: title,
    catalogueName: title,
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  redirect(`/sites/${siteId}/artworks/${artwork.id}`);
}

type ListFilters = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
};

// Lightweight rows for the grid — only what a tile needs to render.
// Full detail is fetched separately (getArtworkDetail) when a tile is opened.
export async function listArtworks(siteId: string, filters: ListFilters) {
  const { q, availability, location, type, group, sort } = filters;

  const orderBy = {
    presentationPrice: sort === "price" ? ("desc" as const) : undefined,
    presentationTitle: sort === "title" ? ("asc" as const) : undefined,
    createdAt: sort === "price" || sort === "title" ? undefined : ("desc" as const),
  };

  return db.artwork.findMany({
    where: {
      siteId,
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
    },
    orderBy,
    select: {
      id: true,
      presentationTitle: true,
      presentationPrice: true,
      catalogueNumber: true,
      availability: true,
      images: { take: 1, select: { url: true } },
    },
  });
}

// Full record for the slide-in detail panel — both facets, all images.
export async function getArtworkDetail(id: string) {
  return db.artwork.findUnique({
    where: { id },
    include: { images: true },
  });
}

export async function updatePresentation(id: string, formData: FormData): Promise<void> {
  const presentationTitle = (formData.get("presentationTitle") as string)?.trim();
  const priceRaw = (formData.get("presentationPrice") as string)?.trim();
  const dimensions = (formData.get("dimensions") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  const presentationGroup = (formData.get("presentationGroup") as string)?.trim() || null;
  const availability = formData.get("availability") as Availability;

  const artwork = await db.artwork.update({
    where: { id },
    data: {
      presentationTitle,
      presentationPrice: priceRaw || null,
      dimensions,
      description,
      medium,
      presentationGroup,
      availability,
      // Visibility is deliberately not set here anymore — it'll be
      // governed by which pages feature the artwork, not a manual toggle
      // on this screen. The column stays in the database (untouched,
      // whatever it was) rather than being dropped, to avoid a
      // destructive migration for a field that may be wanted again.
    },
  });

  revalidatePath(`/sites/${artwork.siteId}/artworks`);
}

export async function updateCatalogue(id: string, formData: FormData): Promise<void> {
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

  const artwork = await db.artwork.update({
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
    },
  });

  revalidatePath(`/sites/${artwork.siteId}/artworks`);
}

export async function deleteArtwork(siteId: string, id: string) {
  await db.artwork.delete({ where: { id } });
  revalidatePath(`/sites/${siteId}/artworks`);
  redirect(`/sites/${siteId}/artworks`);
}

export async function linkImagesToArtwork(artworkId: string, imageIds: string[]) {
  await db.image.updateMany({
    where: { id: { in: imageIds } },
    data: { artworkId },
  });
  const artwork = await db.artwork.findUnique({ where: { id: artworkId } });
  if (artwork) revalidatePath(`/sites/${artwork.siteId}/artworks`);
}

export async function unlinkImageFromArtwork(artworkId: string, imageId: string) {
  await db.image.update({
    where: { id: imageId },
    data: { artworkId: null },
  });
  const artwork = await db.artwork.findUnique({ where: { id: artworkId } });
  if (artwork) revalidatePath(`/sites/${artwork.siteId}/artworks`);
}
