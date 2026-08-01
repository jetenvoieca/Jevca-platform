"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

type ListFilters = {
  purpose?: "marketing" | "related";
  q?: string;
  tag?: string;
  artworkId?: string;
  sort?: string;
};

// "Marketing" vs "Related" isn't a stored field — it's simply whether the
// item has a linked artwork or not. Avoids keeping a redundant flag in
// sync with the artworkId it would just be describing.
export async function listMedia(artistId: string, filters: ListFilters) {
  const { purpose, q, tag, artworkId, sort } = filters;

  return db.image.findMany({
    where: {
      artistId,
      status: { not: "ARCHIVED" },
      ...(purpose === "marketing" ? { artworkId: null } : {}),
      ...(purpose === "related" ? { artworkId: { not: null } } : {}),
      ...(artworkId ? { artworkId } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(q
        ? {
            OR: [
              { caption: { contains: q, mode: "insensitive" as const } },
              { altText: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    // Default is oldest-first — new uploads land at the end, matching the
    // "add to the end of the list" expectation everywhere else in the app,
    // rather than newest-first pushing everything else down.
    orderBy: sort === "caption" ? { caption: "asc" } : { createdAt: "asc" },
    include: { artwork: { select: { id: true, presentationTitle: true } } },
  });
}

export async function countMediaByPurpose(artistId: string) {
  const [marketing, related] = await Promise.all([
    db.image.count({ where: { artistId, status: { not: "ARCHIVED" }, artworkId: null } }),
    db.image.count({ where: { artistId, status: { not: "ARCHIVED" }, artworkId: { not: null } } }),
  ]);
  return { marketing, related };
}

export async function getMediaDetail(id: string) {
  return db.image.findUnique({
    where: { id },
    include: { artwork: { select: { id: true, presentationTitle: true } } },
  });
}

// Lightweight list for the "link to artwork" dropdown — every artwork this
// artist has, regardless of which site it's tied to.
export async function getArtistArtworksForLinking(artistId: string) {
  return db.artwork.findMany({
    where: { artistId },
    select: { id: true, presentationTitle: true },
    orderBy: { presentationTitle: "asc" },
  });
}

export async function updateMedia(id: string, siteId: string, formData: FormData): Promise<void> {
  const caption = (formData.get("caption") as string)?.trim() || null;
  const altText = (formData.get("altText") as string)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string)?.trim() || "";
  const artworkIdRaw = (formData.get("artworkId") as string)?.trim() || "";

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  await db.image.update({
    where: { id },
    data: {
      caption,
      altText,
      tags,
      artworkId: artworkIdRaw || null,
    },
  });

  revalidatePath(`/sites/${siteId}/media`);
}

// Soft delete, same as the rest of the catalogue's Status field already
// supports — reversible via "Show archived" rather than a hard delete.
export async function archiveMedia(id: string, siteId: string) {
  await db.image.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath(`/sites/${siteId}/media`);
}

export async function getMediaTagPresets(artistId: string) {
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: { mediaTags: true },
  });
  return artist?.mediaTags || [];
}

export async function addMediaTagPreset(
  artistId: string,
  siteId: string,
  formData: FormData
) {
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const current = await getMediaTagPresets(artistId);
  const next = current.filter((v) => v.toLowerCase() !== value.toLowerCase());
  await db.artist.update({ where: { id: artistId }, data: { mediaTags: [...next, value] } });
  revalidatePath(`/sites/${siteId}/media/settings`);
}

export async function removeMediaTagPreset(artistId: string, siteId: string, value: string) {
  const current = await getMediaTagPresets(artistId);
  const next = current.filter((v) => v !== value);
  await db.artist.update({ where: { id: artistId }, data: { mediaTags: next } });
  revalidatePath(`/sites/${siteId}/media/settings`);
}
