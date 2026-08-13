"use server";

import { db } from "@/lib/db";
import { getPresignedUploadUrl, getFromR2, uploadToR2, publicMediaUrl } from "@/lib/r2";
import { generateImageSizes } from "@/lib/imageSizes";
import { randomUUID } from "crypto";

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

// Step 1 of 2 for uploading: this only ever handles a filename and content
// type — never the file itself — so it stays a tiny request regardless of
// how large the actual file is. The browser then PUTs the file straight to
// the URL this returns, going directly to R2 rather than through this
// server action, since Netlify Functions cap request payloads at ~6MB
// (nearer 4.5MB once binary content is base64-encoded in transit) — a
// platform limit no amount of Next.js config can raise.
export async function requestUploadUrl(
  artistId: string,
  filename: string,
  contentType: string
) {
  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");
  if (!isImage && !isVideo) {
    return { error: "Only images and videos can be uploaded." };
  }

  const key = `${artistId}/${randomUUID()}-${sanitizeFilename(filename)}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return { uploadUrl, key, kind: isVideo ? ("VIDEO" as const) : ("PHOTO" as const) };
}

// Step 2 of 2: once the browser (or the iPhone Shortcut, for the Hopper —
// see src/app/api/hopper/finalize/route.ts) has PUT the file straight to
// R2 using the URL above, this creates the actual database record —
// again a tiny request, just the key and a couple of strings.
//
// status/source default to exactly today's behaviour (SORTED, no
// source) so every existing caller — MediaPicker, uploadDirect.ts — is
// unaffected. The Hopper route is the only caller that passes
// status: "HOPPER" and source: "iPhone Shortcut".
export async function finalizeUpload(
  artistId: string,
  key: string,
  contentType: string,
  kind: "PHOTO" | "VIDEO",
  posterUrl?: string,
  status: "SORTED" | "HOPPER" = "SORTED",
  source?: string
) {
  // Generate the smaller display/thumbnail versions now, once, rather than
  // making every future page view pay the cost of loading the full-size
  // original (2026-08-13 — see decisions log). The browser already PUT the
  // original straight to R2 in step 1, so it has to be read back here to
  // do the resize — a real but one-time cost, paid at upload rather than
  // on every view thereafter.
  //
  // Deliberately non-fatal: if this fails for any reason (corrupt file,
  // unsupported format, a transient R2 hiccup), the upload itself still
  // succeeds with thumbnailKey/displayKey left null — every place that
  // reads them already falls back to the original url, so nothing breaks;
  // it's just not sped up for this one image until a retry or backfill.
  let thumbnailKey: string | null = null;
  let displayKey: string | null = null;
  if (kind === "PHOTO") {
    try {
      const original = await getFromR2(key);
      if (original.Body) {
        const bytes = await original.Body.transformToByteArray();
        const sizes = await generateImageSizes(Buffer.from(bytes));
        thumbnailKey = `${key}-thumb.jpg`;
        displayKey = `${key}-display.jpg`;
        await Promise.all([
          uploadToR2(thumbnailKey, sizes.thumbnail, sizes.contentType),
          uploadToR2(displayKey, sizes.display, sizes.contentType),
        ]);
      }
    } catch (err) {
      console.error(`[finalizeUpload] Could not generate sizes for ${key}:`, err);
    }
  }

  const image = await db.image.create({
    data: {
      artistId,
      key,
      url: `/api/media/${key}`,
      thumbnailKey,
      displayKey,
      posterUrl: posterUrl || null,
      kind,
      mimeType: contentType,
      status,
      source: source || null,
    },
  });
  return {
    image: {
      ...image,
      thumbnailUrl: publicMediaUrl(thumbnailKey),
      displayUrl: publicMediaUrl(displayKey),
    },
  };
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
    relationLoadStrategy: "query",
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
