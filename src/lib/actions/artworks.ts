"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

async function nextCatalogueNumber(siteId: string) {
  const count = await db.artwork.count({ where: { siteId } });
  return `AW-${String(count + 1).padStart(4, "0")}`;
}

export async function createArtwork(siteId: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

  const catalogueNumber = await nextCatalogueNumber(siteId);
  const artwork = await db.artwork.create({
    data: { siteId, title, catalogueNumber },
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

export async function listArtworks(siteId: string, filters: ListFilters) {
  const { q, availability, visibility, sort } = filters;

  const orderBy = {
    price: sort === "price" ? ("desc" as const) : undefined,
    title: sort === "title" ? ("asc" as const) : undefined,
    createdAt: sort === "price" || sort === "title" ? undefined : ("desc" as const),
  };

  return db.artwork.findMany({
    where: {
      siteId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
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
    include: { images: { take: 1 } },
  });
}

export async function getArtwork(id: string) {
  return db.artwork.findUnique({
    where: { id },
    include: { images: true },
  });
}

export async function updateArtwork(id: string, formData: FormData): Promise<void> {
  const title = (formData.get("title") as string)?.trim();
  const medium = (formData.get("medium") as string)?.trim() || null;
  const dimensions = (formData.get("dimensions") as string)?.trim() || null;
  const yearRaw = (formData.get("year") as string)?.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const priceRaw = (formData.get("price") as string)?.trim();
  const availability = formData.get("availability") as Availability;
  const visible = formData.get("visible") === "on";
  const description = (formData.get("description") as string)?.trim() || null;

  const artwork = await db.artwork.update({
    where: { id },
    data: {
      title,
      medium,
      dimensions,
      year,
      price: priceRaw || null,
      availability,
      visible,
      description,
    },
  });

  revalidatePath(`/sites/${artwork.siteId}/artworks`);
  revalidatePath(`/sites/${artwork.siteId}/artworks/${id}`);
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
  if (artwork) revalidatePath(`/sites/${artwork.siteId}/artworks/${artworkId}`);
}

export async function unlinkImageFromArtwork(artworkId: string, imageId: string) {
  await db.image.update({
    where: { id: imageId },
    data: { artworkId: null },
  });
  const artwork = await db.artwork.findUnique({ where: { id: artworkId } });
  if (artwork) revalidatePath(`/sites/${artwork.siteId}/artworks/${artworkId}`);
}
