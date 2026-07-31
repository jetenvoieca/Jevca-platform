"use server";

import { db } from "@/lib/db";
import { uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadImage(artistId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "No file selected." };
  }

  const isVideo = file.type.startsWith("video/");
  // Practical limit for now — direct server-side upload, not chunked.
  // Larger/chunked video upload can be added when the Media Catalogue's
  // own upload flow needs it.
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      error: `File too large (${Math.round(
        file.size / 1024 / 1024
      )}MB). Limit for now is ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${artistId}/${randomUUID()}-${sanitizeFilename(file.name)}`;

  await uploadToR2(key, buffer, file.type || "application/octet-stream");

  const image = await db.image.create({
    data: {
      artistId,
      key,
      url: `/api/media/${key}`,
      kind: isVideo ? "VIDEO" : "PHOTO",
      mimeType: file.type || "application/octet-stream",
      status: "SORTED", // uploaded directly = already sorted, not in the Hopper
    },
  });

  return { image };
}

export async function listImages(artistId: string, q?: string) {
  return db.image.findMany({
    where: {
      artistId,
      status: { not: "ARCHIVED" },
      ...(q
        ? {
            OR: [
              { caption: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}

// Used by the Artwork Feature block picker — reads the Presentation facet,
// since that's what a page visitor would see (matches the "block pulls in
// Presentation data" decision in the Artworks Catalogue design). Scoped to
// the artist, not the site, since a page on any of that artist's sites can
// feature any of their artworks.
export async function getArtworksForArtist(artistId: string, q?: string) {
  return db.artwork.findMany({
    where: {
      artistId,
      ...(q ? { presentationTitle: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { images: { take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}

async function nextCatalogueNumber(artistId: string) {
  // See src/lib/actions/artworks.ts for why this is based on the highest
  // existing number rather than a row count.
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

export async function quickCreateArtwork(artistId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required." };

  for (let attempt = 0; attempt < 3; attempt++) {
    const catalogueNumber = await nextCatalogueNumber(artistId);
    try {
      const artwork = await db.artwork.create({
        data: {
          artistId,
          catalogueNumber,
          presentationTitle: trimmed,
          catalogueName: trimmed,
        },
      });
      return { artwork };
    } catch (err: unknown) {
      const isUniqueViolation =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw err;
    }
  }
  throw new Error("Could not generate a unique catalogue number.");
}
