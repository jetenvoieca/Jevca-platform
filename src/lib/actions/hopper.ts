"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { appendImageToTimeline } from "./videoEditor";

export async function countHopper(artistId: string): Promise<number> {
  return db.image.count({ where: { artistId, status: "HOPPER" } });
}

export async function listHopperQueue(artistId: string) {
  return db.image.findMany({
    where: { artistId, status: "HOPPER" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      posterUrl: true,
      kind: true,
      caption: true,
      altText: true,
      tags: true,
      createdAt: true,
    },
  });
}

export async function updateHopperCaption(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const caption = (formData.get("caption") as string)?.trim() || null;
  const altText = (formData.get("altText") as string)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string)?.trim() || "";
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  await db.image.update({ where: { id }, data: { caption, altText, tags } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

export async function binHopperItem(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

export async function addHopperItemToMedia(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "SORTED" } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

export async function countBucket(artistId: string): Promise<number> {
  return db.image.count({ where: { artistId, status: "BUCKET" } });
}

export async function addHopperItemToBucket(id: string, siteId: string): Promise<void> {
  const image = await db.image.findUnique({ where: { id }, select: { artistId: true } });
  if (!image) return;
  await appendImageToTimeline(image.artistId, siteId, id);
  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function addHopperItemToArtwork(
  id: string,
  siteId: string,
  artworkId: string,
  setAsMain: boolean
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.image.update({ where: { id }, data: { status: "SORTED", artworkId } });
    if (setAsMain) {
      await tx.artwork.update({ where: { id: artworkId }, data: { mainImageId: id } });
    }
  });
  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/artworks`);
}
