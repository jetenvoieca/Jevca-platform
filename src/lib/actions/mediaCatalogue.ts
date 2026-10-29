"use server";

import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { publicMediaUrl } from "@/lib/r2";
import { ARTWORK_IMAGE_SELECT, toArtworkImage } from "@/lib/artworkImages";
import { deleteImagePermanently, deleteImagesPermanently } from "./imageDelete";

type ListFilters = {
  // "marketing": pictures and videos not tied to an artwork (an
  // artwork's one picture is its own).
  purpose?: "marketing";
  // Pictures or videos only (2026-10-15 — the Marketing and Videos views).
  kind?: "PHOTO" | "VIDEO";
  q?: string;
  tag?: string;
  // Pagination — added 2026-08-08. Previously this fetched every matching
  // row unconditionally, every time, including just to open one item's
  // detail panel — a real, measured contributor to Media Catalogue
  // slowness that gets worse as the catalogue grows. Defaults keep a
  // sensible page size without every call site having to specify one.
  offset?: number;
  limit?: number;
  // Newest first (2026-10-16 — the media picker, so something just
  // uploaded is at the top); otherwise oldest first, as below.
  newestFirst?: boolean;
};

const DEFAULT_PAGE_SIZE = 60;

export async function listMedia(artistId: string, filters: ListFilters) {
  await requireArtistAccess(artistId);
  const { purpose, kind, q, tag, offset = 0, limit = DEFAULT_PAGE_SIZE, newestFirst = false } = filters;

  const where = {
    artistId,
    status: { not: "ARCHIVED" as const },
    ...(purpose === "marketing" ? { artworkId: null } : {}),
    ...(kind ? { kind } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q
      ? {
          OR: [
            { caption: { contains: q, mode: "insensitive" as const } },
            { altText: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.image.findMany({
      where,
      // Oldest-first — new uploads land at the end, matching the "add to
      // the end of the list" expectation everywhere else in the app,
      // rather than newest-first pushing everything else down. Used to
      // be selectable (a "Sort: Caption" option) until the Sort dropdown
      // was removed entirely (2026-09-12, direct request — "never used
      // it or even know why I would"); this is now the only order.
      orderBy: { createdAt: newestFirst ? "desc" : "asc" },
      // The artwork's Name — its one and only name (2026-09-23).
      include: { artwork: { select: { id: true, catalogueName: true } } },
      relationLoadStrategy: "query",
      skip: offset,
      take: limit,
    }),
    db.image.count({ where }),
  ]);

  // Every consumer of this list only ever shows these at small sizes, so
  // the thumbnail (fast, served straight from storage) always wins here
  // — falls back to the original proxied url only for images uploaded
  // before 2026-08-13 that haven't been backfilled yet.
  const rowsWithThumbnails = rows.map((r) => ({
    ...r,
    url: publicMediaUrl(r.thumbnailKey) || r.url,
  }));

  return { rows: rowsWithThumbnails, total };
}

export async function getMediaDetail(id: string) {
  await requireRecordAccess(db.image.findUnique({ where: { id }, select: { artistId: true } }));
  const image = await db.image.findUnique({
    where: { id },
    // catalogueName — see the matching note in listMedia above.
    include: { artwork: { select: { id: true, catalogueName: true } } },
    relationLoadStrategy: "query",
  });
  if (!image) return null;
  // displayUrl is for the panel's medium preview; url stays the true
  // original throughout, since the lightbox's "view full size" click
  // deliberately shows the real, unresized file.
  return { ...image, displayUrl: publicMediaUrl(image.displayKey) || image.url };
}

export async function updateMedia(id: string, siteId: string, formData: FormData): Promise<void> {
  await requireRecordAccess(db.image.findUnique({ where: { id }, select: { artistId: true } }));
  const caption = (formData.get("caption") as string)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string)?.trim() || "";

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Alt text removed from this form 2026-08-17 (confirmed unused
  // anywhere in the codebase — stored, editable, searchable, but never
  // actually rendered as an img alt attribute). Deliberately not touched
  // here at all, rather than writing null on every save now that the
  // client never sends it — these are real, potentially long-lived
  // library items, not fresh Hopper uploads, so any alt text already on
  // one stays exactly as it was rather than getting silently wiped out.
  //
  // artworkId removed from this form the same way, 2026-08-19, direct
  // request — the "Related Artwork" dropdown here set the exact same
  // field an artwork's own Related Images picker does, just from the
  // other direction, which risked feeling like a second, weaker, easily
  // stale-looking way to manage the same relationship. Linking now only
  // happens from the artwork side. Also deliberately not touched here
  // for the same reason as alt text above: this action no longer sends
  // it, so touching it here would silently unlink every existing
  // relationship the next time someone saved an unrelated caption edit.
  await db.image.update({
    where: { id },
    data: {
      caption,
      tags,
      // Cleared on any real save here — matches the same "saved at all
      // counts as reviewed" approach as Artwork's needsReview above
      // (2026-08-17). Harmless for a media item that was never flagged
      // in the first place.
      needsReview: false,
    },
  });

  revalidatePath(`/sites/${siteId}/media`);
}

// 2026-08-19, direct request — was `status: "ARCHIVED"` with a confirm
// dialog that claimed it could be "restored later via Show archived,"
// which was never actually true — no such view exists anywhere in this
// app. Now genuinely deletes, matching the same reasoning as the
// Hopper's Bin (see deleteImagePermanently) — a soft-delete nobody can
// actually undo isn't more honest than a real one, just slower to find
// out.
export async function deleteMedia(
  id: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRecordAccess(db.image.findUnique({ where: { id }, select: { artistId: true } }));
  const result = await deleteImagePermanently(id);
  if (result.ok) {
    revalidatePath(`/sites/${siteId}/media`);
  }
  return result;
}

// Select → Delete in the Media Catalogue (2026-10-15): several at once,
// with the same rules as one (see deleteImagesPermanently).
export async function deleteMediaItems(
  artistId: string,
  siteId: string,
  ids: string[]
): Promise<{ deletedCount: number; failed: { id: string; error: string }[] }> {
  await requireArtistAccess(artistId);
  const result = await deleteImagesPermanently(artistId, ids);
  if (result.deletedCount > 0) revalidatePath(`/sites/${siteId}/media`);
  return result;
}

export async function getMediaTagPresets(artistId: string) {
  await requireArtistAccess(artistId);
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
  await requireArtistAccess(artistId);
  const value = (formData.get("value") as string)?.trim();
  if (!value) return;
  const current = await getMediaTagPresets(artistId);
  const next = current.filter((v) => v.toLowerCase() !== value.toLowerCase());
  await db.artist.update({ where: { id: artistId }, data: { mediaTags: [...next, value] } });
  revalidatePath(`/sites/${siteId}/marketing/settings`);
}

export async function removeMediaTagPreset(artistId: string, siteId: string, value: string) {
  await requireArtistAccess(artistId);
  const current = await getMediaTagPresets(artistId);
  const next = current.filter((v) => v !== value);
  await db.artist.update({ where: { id: artistId }, data: { mediaTags: next } });
  revalidatePath(`/sites/${siteId}/marketing/settings`);
}

// One artwork's name and picture, for the Media Catalogue's read-only
// Artworks view (2026-10-15). Only this artist's own.
export async function getArtworkForMedia(artistId: string, artworkId: string) {
  await requireArtistAccess(artistId);
  const artwork = await db.artwork.findFirst({
    where: { id: artworkId, artistId },
    select: { id: true, catalogueName: true, mainImage: { select: ARTWORK_IMAGE_SELECT } },
  });
  if (!artwork) return null;
  return {
    id: artwork.id,
    catalogueName: artwork.catalogueName,
    image: artwork.mainImage ? toArtworkImage(artwork.mainImage) : null,
  };
}
