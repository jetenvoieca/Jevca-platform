"use server";

import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { createUploadUrl, saveUpload, type FinalizeUploadOptions } from "@/lib/mediaUpload";
import { NotAllowedError, requireArtistAccess } from "@/lib/currentUser";
import { createArtworkWithRetry } from "./artworks";
import { buildArtworkWhere, buildArtworkOrderBy, type ArtworkFilterInput } from "@/lib/artworkFilters";

// Uploading (2026-10-26: the work itself is in lib/mediaUpload.ts,
// shared with the Hopper's routes): step 1 asks for where to put the
// file, step 2 records it once it's there. Only for a client the person
// logged in may access, and only a file uploaded for that client (every
// key starts with its client's id).
export async function requestUploadUrl(artistId: string, filename: string, contentType: string) {
  await requireArtistAccess(artistId);
  return createUploadUrl(artistId, filename, contentType);
}

export async function finalizeUpload(
  artistId: string,
  key: string,
  contentType: string,
  kind: "PHOTO" | "VIDEO",
  options: FinalizeUploadOptions = {}
) {
  await requireArtistAccess(artistId);
  if (!key.startsWith(`${artistId}/`)) throw new NotAllowedError();
  return saveUpload(artistId, key, contentType, kind, options);
}

export async function listImages(artistId: string, q?: string) {
  await requireArtistAccess(artistId);
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
    // Only works still for sale (2026-10-20 — Locations' Add works).
    availableOnly?: boolean;
    offset?: number;
  } = {}
): Promise<{ rows: PickerArtwork[]; total: number }> {
  await requireArtistAccess(artistId);
  const { excludeIds = [], availableOnly = false, offset = 0, ...rest } = filters;
  const where = {
    ...buildArtworkWhere(artistId, rest),
    ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    ...(availableOnly ? { availability: "AVAILABLE" as const } : {}),
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
  await requireArtistAccess(artistId);
  const trimmed = title.trim();
  if (!trimmed) return { error: "Name is required." };
  const artwork = await createArtworkWithRetry(artistId, { catalogueName: trimmed });
  return { artwork };
}
