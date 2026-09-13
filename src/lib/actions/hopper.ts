"use server";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { appendImageToTimeline } from "./videoEditor";
import { createArtworkWithRetry } from "./artworks";
import { deleteImagePermanently } from "./imageDelete";

// None of these actions revalidate /sites/[id]/hopper OR /sites/[id]/
// artworks (2026-08-17, second pass at this same fix) — both those
// pages are already force-dynamic (never cached to begin with, so
// revalidatePath had no real purpose on either), and every client flow
// that wants an immediate refresh already calls router.refresh()
// explicitly (see advanceAfterAction in HopperView.tsx). Calling
// revalidatePath on the route someone is currently viewing triggers an
// automatic background client refresh regardless of any explicit
// router.refresh() elsewhere — that's confirmed as the actual cause of
// a real bug (the "Add Artwork" flow's inline quick-catalogue fields
// being wiped out before anyone could type into them). The first pass
// at this fix only removed the /hopper call, reasoning that /artworks
// was a genuinely different route and therefore safe — but the bug
// persisted after that fix shipped, which means that reasoning doesn't
// hold: /hopper and /artworks share the same parent layout
// (src/app/sites/[id]/layout.tsx), and revalidating one apparently
// still causes Next to refresh whatever route is actually being viewed
// under that shared layout, not just the literal path named. Rather
// than rely on precisely understanding Next's internal revalidation
// mechanics here, this now follows the same rule already proven correct
// everywhere else in this project: don't revalidate a force-dynamic
// route from a Server Action at all — let explicit router.refresh()
// calls do that job. /bucket is kept, since appendImageToTimeline
// building that route's data is a genuine, different case worth
// checking if this recurs there too.

// countHopper/countBucket power sidebar badges in the shared site layout
// (src/app/sites/[id]/layout.tsx), which re-runs on every navigation
// inside a site. A plain db.image.count() is cheap on its own, but paid
// on every single click it adds up — and neither number needs to be
// exact to the second (2026-08-31, same reasoning as getOpenAlerts in
// lib/alerts.ts). Cached for 60s per artist instead of queried fresh on
// every navigation.
const countHopperCached = unstable_cache(
  async (artistId: string) => db.image.count({ where: { artistId, status: "HOPPER" } }),
  ["count-hopper"],
  { revalidate: 60 }
);

export async function countHopper(artistId: string): Promise<number> {
  return countHopperCached(artistId);
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
      description: true,
      altText: true,
      tags: true,
      createdAt: true,
    },
  });
}

// Powers the limited "set new Main image" modal opened from Delete &
// Replace (SetMainFromHopperModal.tsx, via ArtworkImageManager.tsx) —
// just the single newest item currently awaiting sorting in the Hopper,
// or null if it's empty. Deliberately its own lightweight query rather
// than reusing listHopperQueue's full list plus the sort-order/
// hasInteracted session state HopperView.tsx layers on top of it — that
// modal only ever needs to offer one candidate image at a time, and
// "newest" is already this app's default sort order everywhere else in
// the Hopper. createdAt is converted to an ISO string here (not left as
// a raw Date) since this is called directly from a client component,
// the same reasoning as the Decimal-to-string conversions in
// getArtworkDetailForClient (actions/artworks.ts).
export async function getNextHopperItem(artistId: string) {
  const item = await db.image.findFirst({
    where: { artistId, status: "HOPPER" },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, posterUrl: true, kind: true, createdAt: true },
  });
  if (!item) return null;
  return { ...item, createdAt: item.createdAt.toISOString() };
}

// 2026-08-19, direct request — was `status: "ARCHIVED"` (the same
// reversible-delete pattern used everywhere else in this app), changed
// specifically for Images: there was never a Trash/Archived view to
// actually find and restore one, so "reversible" was theoretical, not
// real. See deleteImagePermanently for the full reasoning — this stays
// scoped to Images; Site archiving (a completely different, much bigger
// action) is untouched.
export async function binHopperItem(
  id: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteImagePermanently(id);
}

// Bulk version of binHopperItem (2026-09-07, direct request — "add
// ability to bulk select images to delete") for the Up next grid's
// select mode. Reuses the exact same per-item delete (and its same
// "still linked elsewhere" failure case) rather than a separate bulk
// implementation, so the two can never behave differently. Runs the
// batch concurrently — Hopper selections are a handful to a few dozen
// images at once, not thousands, so no chunking/queueing is needed here.
// Partial failure is reported back (which ids failed and why) rather
// than all-or-nothing, so one linked-elsewhere image doesn't block
// deleting the rest of a selection.
export async function binHopperItems(
  ids: string[],
  siteId: string
): Promise<{ deletedCount: number; failed: { id: string; error: string }[] }> {
  const results = await Promise.all(
    ids.map(async (id) => ({ id, result: await deleteImagePermanently(id) }))
  );
  const failed = results
    .filter((r) => !r.result.ok)
    .map((r) => ({ id: r.id, error: (r.result as { ok: false; error: string }).error }));
  return { deletedCount: results.length - failed.length, failed };
}

export async function addHopperItemToMedia(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "SORTED", needsReview: true } });
}

const countBucketCached = unstable_cache(
  async (artistId: string) => db.image.count({ where: { artistId, status: "BUCKET" } }),
  ["count-bucket"],
  { revalidate: 60 }
);

export async function countBucket(artistId: string): Promise<number> {
  return countBucketCached(artistId);
}

export async function addHopperItemToBucket(
  id: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const image = await db.image.findUnique({ where: { id }, select: { artistId: true } });
  if (!image) return { ok: false, error: "That item couldn't be found." };
  const result = await appendImageToTimeline(image.artistId, siteId, id);
  if (result.ok) {
    revalidatePath(`/sites/${siteId}/bucket`);
  }
  return result;
}

// Links a Hopper item to an existing artwork, either as its Main image
// or as an ancillary Related one. setAsMain decides which; relatedName
// (2026-09-13, direct request — "Manage Artwork images") is an optional
// name for the Related case only, saved straight onto the image's own
// caption (the same field Media Catalogue and ArtworkImageManager
// already read for a related image's display name) — omitted or
// ignored entirely when setAsMain is true, since Main images aren't
// named this way.
export async function addHopperItemToArtwork(
  id: string,
  siteId: string,
  artworkId: string,
  setAsMain: boolean,
  relatedName?: string | null
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.image.update({
      where: { id },
      data: {
        status: "SORTED",
        artworkId,
        ...(!setAsMain && relatedName ? { caption: relatedName } : {}),
      },
    });
    if (setAsMain) {
      await tx.artwork.update({ where: { id: artworkId }, data: { mainImageId: id } });
    }
  });
}

// Replaces the old two-step "Add Artwork" flow (2026-08-18, direct
// request). Previously: pressing "Add Artwork" created the Artwork
// immediately via quickCreateArtwork (a real, live catalogue entry from
// that click alone), then each inline Catalogue field saved itself
// separately as it was filled in. Now nothing is written to the database
// until this single action runs, fired once from "Done, next item": the
// artwork is created with every field the person filled in, and the
// Hopper image is linked to it (as its main image) as part of the same
// action. Cancelling before "Done, next item" needs no cleanup at all,
// since nothing was ever created — that's the main benefit over the old
// approach, not just fewer clicks.
//
// Renamed "Add Artwork" → "Create new artwork" (2026-09-13, direct
// request), and its form now matches the full Artwork Catalogue tab —
// Name and Tier included, Reference/Offered price included — with only
// the Available/SOLD toggle left out (a brand-new artwork always starts
// AVAILABLE; see QuickCatalogueFields in HopperView.tsx). Name is no
// longer collected earlier, on the plain sorting card, at all ("no name
// or description at this stage") — it comes straight from this form's
// own `catalogueName` field instead. Description is left blank — it's a
// Presentation-tab field, out of scope for this Catalogue-only quick
// form; Presentation's own default description (Type/Size/Medium strung
// together) fills in for it until someone writes a real one.
//
// needsReview stays true here, same as the old quickCreateArtwork(...,
// true) call did — filling in these fields is still optional, so a
// Hopper-created artwork can genuinely still be incomplete even after
// this. It clears automatically the first time Catalogue or Presentation
// is properly saved from the full editor (see updateCatalogue /
// updatePresentation in artworks.ts).
export async function createArtworkFromHopperQuick(
  hopperImageId: string,
  siteId: string,
  artistId: string,
  formData: FormData
): Promise<{ ok: true; artwork: { id: string } } | { ok: false; error: string }> {
  const title = ((formData.get("catalogueName") as string) || "").trim() || "Untitled";
  const tier = (formData.get("tier") as string)?.trim() || null;
  const offeredPriceRaw = (formData.get("offeredPrice") as string)?.trim();
  const dateRaw = (formData.get("date") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const catalogueGroup = (formData.get("catalogueGroup") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const edition = (formData.get("edition") as string)?.trim() || null;
  const availableQtyRaw = (formData.get("availableQty") as string)?.trim();
  const location = (formData.get("location") as string)?.trim() || null;
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;

  let artwork: { id: string };
  try {
    artwork = await createArtworkWithRetry(artistId, {
      presentationTitle: title,
      catalogueName: title,
      tier,
      offeredPrice: offeredPriceRaw || null,
      // Mirrors updateCatalogue's own "Offered price also sets
      // Presentation's Price" behaviour (see the note on
      // Artwork.presentationPrice in schema.prisma) — kept in sync from
      // the moment the artwork is first created, not just on later
      // edits. presentationPrice is typed as a number here (unlike
      // offeredPrice above, read as a raw string) — same conversion
      // duplicateArtwork already does.
      presentationPrice: offeredPriceRaw ? Number(offeredPriceRaw) : null,
      type,
      catalogueGroup,
      size,
      edition,
      availableQty: availableQtyRaw ? parseInt(availableQtyRaw, 10) : null,
      location,
      studioNotes,
      medium,
      // No Available/SOLD toggle on this form (2026-09-13, direct
      // request) — every artwork created this way starts AVAILABLE.
      availability: "AVAILABLE",
      date: dateRaw || null,
      needsReview: true,
    });
  } catch {
    return { ok: false, error: "Couldn't create the artwork. Try again." };
  }

  await db.$transaction(async (tx) => {
    await tx.image.update({
      where: { id: hopperImageId },
      data: { status: "SORTED", artworkId: artwork.id },
    });
    await tx.artwork.update({ where: { id: artwork.id }, data: { mainImageId: hopperImageId } });
  });

  return { ok: true, artwork: { id: artwork.id } };
}
