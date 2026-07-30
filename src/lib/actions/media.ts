"use server";

import { db } from "@/lib/db";
import { uploadToR2 } from "@/lib/r2";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadImage(siteId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "No file selected." };
  }

  const isVideo = file.type.startsWith("video/");
  // Practical limit for now — direct server-side upload, not chunked.
  // Larger/chunked video upload can be added when the Images module is built properly.
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      error: `File too large (${Math.round(
        file.size / 1024 / 1024
      )}MB). Limit for now is ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${siteId}/${randomUUID()}-${sanitizeFilename(file.name)}`;

  await uploadToR2(key, buffer, file.type || "application/octet-stream");

  const image = await db.image.create({
    data: {
      siteId,
      key,
      url: `/api/media/${key}`,
      kind: isVideo ? "VIDEO" : "PHOTO",
      mimeType: file.type || "application/octet-stream",
      status: "SORTED", // uploaded directly into a block = already sorted, not in the Hopper
    },
  });

  revalidatePath(`/sites/${siteId}`);
  return { image };
}

export async function listImages(siteId: string, q?: string) {
  return db.image.findMany({
    where: {
      siteId,
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
// Presentation data" decision in the Artworks Catalogue design).
export async function getArtworksForSite(siteId: string, q?: string) {
  return db.artwork.findMany({
    where: {
      siteId,
      ...(q ? { presentationTitle: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { images: { take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}

async function nextCatalogueNumber(siteId: string) {
  const count = await db.artwork.count({ where: { siteId } });
  return `AW-${String(count + 1).padStart(4, "0")}`;
}

export async function quickCreateArtwork(siteId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required." };

  const catalogueNumber = await nextCatalogueNumber(siteId);

  const artwork = await db.artwork.create({
    data: {
      siteId,
      catalogueNumber,
      presentationTitle: trimmed,
      catalogueName: trimmed,
    },
  });

  revalidatePath(`/sites/${siteId}`);
  return { artwork };
}
