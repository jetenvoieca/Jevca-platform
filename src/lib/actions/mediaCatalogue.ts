"use server";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { publicMediaUrl } from "@/lib/r2";
import { deleteImagePermanently } from "./imageDelete";

type ListFilters = {
  purpose?: "marketing" | "related";
  q?: string;
  tag?: string;
  artworkId?: string;
  sort?: string;
  // Pagination — added 2026-08-08. Previously this fetched every matching
  // row unconditionally, every time, including just to open one item's
  // detail panel — a real, measured contributor to Media Catalogue
  // slowness that gets worse as the catalogue grows. Defaults keep a
  // sensible page size without every call site having to specify one.
  offset?: number;
  limit?: number;
};

// Powers the "raw import" count shown next to Media Catalogue in the
// nav (2026-08-17) — see the matching note on Image.needsReview in
// schema.prisma for exactly what sets/clears this.
//
// Also part of the shared site layout (src/app/sites/[id]/layout.tsx),
// which re-runs this on every navigation inside a site. Cached for 60s
// per artist (2026-08-31) — same reasoning as the hopper/bucket counts
// and getOpenAlerts: cheap on its own, but adds up when paid on every
// click, and doesn't need second-level freshness.
const countMediaNeedingReviewCached = unstable_cache(
  async (artistId: string) => db.image.count({ where: { artistId, needsReview: true } }),
  ["count-media-needing-review"],
  { revalidate: 60 }
);

export async function countMediaNeedingReview(artistId: string): Promise<number> {
  return countMediaNeedingReviewCached(artistId);
}

const DEFAULT_PAGE_SIZE = 60;

// "Marketing" vs "Related" isn't a stored field — it's simply whether the
// item has a linked artwork or not. Avoids keeping a redundant flag in
// sync with the artworkId it would just be describing.
export async function listMedia(artistId: string, filters: ListFilters) {
  const { purpose, q, tag, artworkId, sort, offset = 0, limit = DEFAULT_PAGE_SIZE } = filters;

  const where = {
    artistId,
    status: { not: "ARCHIVED" as const },
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
  };

  const [rows, total] = await Promise.all([
    db.image.findMany({
      where,
      // Default is oldest-first — new uploads land at the end, matching
      // the "add to the end of the list" expectation everywhere else in
      // the app, rather than newest-first pushing everything else down.
      orderBy: sort === "caption" ? { caption: "asc" } : { createdAt: "asc" },
      include: { artwork: { select: { id: true, presentationTitle: true } } },
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

export async function countMediaByPurpose(artistId: string) {
  const [marketing, related] = await Promise.all([
    db.image.count({ where: { artistId, status: { not: "ARCHIVED" }, artworkId: null } }),
    db.image.count({ where: { artistId, status: { not: "ARCHIVED" }, artworkId: { not: null } } }),
  ]);
  return { marketing, related };
}

export async function getMediaDetail(id: string) {
  const image = await db.image.findUnique({
    where: { id },
    include: { artwork: { select: { id: true, presentationTitle: true } } },
    relationLoadStrategy: "query",
  });
  if (!image) return null;
  // displayUrl is for the panel's medium preview; url stays the true
  // original throughout, since the lightbox's "view full size" click
  // deliberately shows the real, unresized file.
  return { ...image, displayUrl: publicMediaUrl(image.displayKey) || image.url };
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
  const result = await deleteImagePermanently(id);
  if (result.ok) {
    revalidatePath(`/sites/${siteId}/media`);
  }
  return result;
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
