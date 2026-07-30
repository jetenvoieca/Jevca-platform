"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

async function nextCatalogueNumber(siteId: string) {
  const count = await db.artwork.count({ where: { siteId } });
  return `AW-${String(count + 1).padStart(4, "0")}`;
}

// "+ Add New Artwork" — minimum entry is a Title. That single value seeds
// both facets (presentationTitle and catalogueName) as a starting point;
// from this point on the two are independent.
export async function createArtwork(siteId: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const catalogueNumber = await nextCatalogueNumber(siteId);
  const artwork = await db.artwork.create({
    data: {
      siteId,
      catalogueNumber,
      presentationTitle: title,
      catalogueName: title,
    },
  });

  revalidatePath(`/sites/${siteId}/artworks`);
  redirect(`/sites/${siteId}/artworks/${artwork.id}`);
}

type ListFilters = {
  q?: string;
  availability?: string;
  visibility?: string;
  sort?: string;
};

// Lightweight rows for the grid — only what a tile needs to render.
// Full detail is fetched separately (getArtworkDetail) when a tile is opened.
export async function listArtworks(siteId: string, filters: ListFilters) {
  const { q, availability, visibility, sort } = filters;

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
      ...(visibility === "shown"
        ? { visible: true }
        : visibility === "hidden"
        ? { visible: false }
        : {}),
    },
    orderBy,
    select: {
      id: true,
      presentationTitle: true,
      presentationPrice: true,
      catalogueNumber: true,
      availability: true,
      visible: true,
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
  const visible = formData.get("visible") === "on";

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
      visible,
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
