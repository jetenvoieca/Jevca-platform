"use server";

import { db } from "@/lib/db";
import { getPresignedUploadUrl, getFromR2, uploadToR2, publicMediaUrl } from "@/lib/r2";
import { generateImageSizes } from "@/lib/imageSizes";
import { randomUUID } from "crypto";
import { createArtworkWithRetry } from "./artworks";
import { buildArtworkWhere, buildArtworkOrderBy, type ArtworkFilterInput } from "@/lib/artworkFilters";
import { sanitizeFilename } from "@/lib/sanitizeFilename";
import { requestVideoPosters } from "@/lib/videoPosters";

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

// Everything finalizeUpload accepts beyond the four required arguments.
// All optional; leaving them all out gives exactly the behaviour every
// early caller (MediaPicker, uploadDirect.ts) relied on — a SORTED image
// with no source, caption or details.
//
// - status/source: only the Hopper's callers pass status: "HOPPER" and a
//   source ("iPhone Shortcut", "Studio", the browser importer, ...).
// - caption/description: the Hopper's "Name"/"Description" (2026-09-02),
//   carried across from whatever the sender asked for before sending.
//   Both stay freely editable afterwards from the Hopper sorting card.
// - artworkSize/artworkPrice/artworkType (2026-09-21) and
//   artworkLocation (2026-09-26): details the Studio capture app
//   collects — see the matching note on Image in schema.prisma.
//   artworkPrice is a plain numeric string, validated by the caller
//   before it gets here.
type FinalizeUploadOptions = {
  posterUrl?: string;
  status?: "SORTED" | "HOPPER";
  source?: string;
  caption?: string;
  description?: string;
  artworkSize?: string;
  artworkPrice?: string;
  artworkType?: string;
  artworkLocation?: string;
};

// Step 2 of 2: once the browser (or the iPhone Shortcut / Studio app, for
// the Hopper — see src/app/api/hopper/finalize/route.ts) has PUT the file
// straight to R2 using the URL above, this creates the actual database
// record — again a tiny request, just the key and a few strings.
export async function finalizeUpload(
  artistId: string,
  key: string,
  contentType: string,
  kind: "PHOTO" | "VIDEO",
  options: FinalizeUploadOptions = {}
) {
  const {
    posterUrl,
    status = "SORTED",
    source,
    caption,
    description,
    artworkSize,
    artworkPrice,
    artworkType,
    artworkLocation,
  } = options;

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
      caption: caption || null,
      description: description || null,
      artworkSize: artworkSize || null,
      artworkPrice: artworkPrice || null,
      artworkType: artworkType || null,
      artworkLocation: artworkLocation || null,
    },
  });
  // A video that came without a still picture gets one made (2026-10-16).
  if (kind === "VIDEO" && !image.posterUrl) await requestVideoPosters();
  return {
    image: {
      ...image,
      // Decimal isn't a plain value, so it can't be handed back to a
      // client component from a server action as-is — sent as a string.
      artworkPrice: image.artworkPrice?.toString() ?? null,
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
    // Included 2026-08-17 so MediaPicker can show which artwork an image
    // is already related to (previously only its caption showed, so a
    // photo already tied to a specific piece looked no different from an
    // unrelated one until you'd actually picked it and looked closer).
    // The artwork's Name — its one and only name (2026-09-23).
    include: { artwork: { select: { id: true, catalogueName: true } } },
    relationLoadStrategy: "query",
    take: 60,
  });
}

// ArtworkPicker's list (Curations, campaign mails, Hopper). Scoped to the
// artist, not the site, since any of that artist's sites can feature any
// of their artworks. Search matches name, catalogue # and medium; Location
// and Type mean exactly what they mean in the Artwork Catalogue — the same
// shared buildArtworkWhere and order (lib/artworkFilters.ts). Returned a page at a time (2026-10-13): it used
// to return only the 60 newest, so older works could never be picked.
// Works to leave out (e.g. already in the curation) are excluded here, not
// after loading, so they don't use up a page.
export type PickerArtwork = {
  id: string;
  catalogueName: string;
  // Shown under the name, as in the Artwork Catalogue — several works can
  // share a name but differ in type.
  type: string | null;
  imageUrl: string | null;
  presentationPrice: string | null;
  availability: string;
};

const PICKER_PAGE_SIZE = 60;

export async function getArtworksForArtist(
  artistId: string,
  filters: Pick<ArtworkFilterInput, "q" | "location" | "type"> & {
    excludeIds?: string[];
    offset?: number;
  } = {}
): Promise<{ rows: PickerArtwork[]; total: number }> {
  const { excludeIds = [], offset = 0, ...rest } = filters;
  const where = {
    ...buildArtworkWhere(artistId, rest),
    ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy: buildArtworkOrderBy(),
      select: {
        id: true,
        catalogueName: true,
        type: true,
        presentationPrice: true,
        availability: true,
        mainImage: { select: { url: true, thumbnailKey: true } },
        images: { take: 1, select: { url: true, thumbnailKey: true } },
      },
      skip: offset,
      take: PICKER_PAGE_SIZE,
    }),
    db.artwork.count({ where }),
  ]);
  // The chosen main image, else the first image; its small thumbnail
  // where one exists — same as the Artwork Catalogue grid.
  return {
    rows: rows.map(({ mainImage, images, presentationPrice, ...a }) => {
      const image = mainImage || images[0] || null;
      return {
        ...a,
        presentationPrice: presentationPrice != null ? presentationPrice.toString() : null,
        imageUrl: image ? publicMediaUrl(image.thumbnailKey) || image.url : null,
      };
    }),
    total,
  };
}

// ArtworkPicker's own inline "create new" (used from other pickers, e.g.
// Related Images) — a named artwork with nothing else set yet, numbered
// and priced the same way as every other new artwork.
export async function quickCreateArtwork(artistId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Name is required." };
  const artwork = await createArtworkWithRetry(artistId, { catalogueName: trimmed });
  return { artwork };
}
