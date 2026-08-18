"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { appendImageToTimeline } from "./videoEditor";
import { createArtworkWithRetry } from "./artworks";

type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

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

// Only caption is editable from the Hopper now (2026-08-17) — Tags and
// Alt text were both removed from this screen (see the matching note on
// SortingCard in HopperView.tsx for why), so this no longer touches
// either field. Previously wrote both on every save regardless of
// whether the client actually sent a new value, which — once the client
// stopped sending them — would have silently overwritten whatever was
// there with empty/null on every caption blur.
export async function updateHopperCaption(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const caption = (formData.get("caption") as string)?.trim() || null;
  await db.image.update({ where: { id }, data: { caption } });
}

export async function binHopperItem(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "ARCHIVED" } });
}

export async function addHopperItemToMedia(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "SORTED", needsReview: true } });
}

export async function countBucket(artistId: string): Promise<number> {
  return db.image.count({ where: { artistId, status: "BUCKET" } });
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
}

// Replaces the old two-step "Add Artwork" flow (2026-08-18, direct
// request). Previously: pressing "Add Artwork" created the Artwork
// immediately via quickCreateArtwork (a real, live catalogue entry from
// that click alone), then each inline Catalogue field saved itself
// separately as it was filled in — two distinct rounds of "entry and
// commit". Now nothing is written to the database until this single
// action runs, fired once from "Done, next item": the artwork is created
// with every field the person filled in, and the Hopper image is linked
// to it (as its main image) as part of the same action. Cancelling before
// "Done, next item" needs no cleanup at all, since nothing was ever
// created — that's the main benefit over the old approach, not just fewer
// clicks.
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
  title: string,
  formData: FormData
): Promise<{ ok: true; artwork: { id: string } } | { ok: false; error: string }> {
  const finalTitle = title.trim() || "Untitled";

  const yearRaw = (formData.get("year") as string)?.trim();
  const type = (formData.get("type") as string)?.trim() || null;
  const catalogueGroup = (formData.get("catalogueGroup") as string)?.trim() || null;
  const size = (formData.get("size") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const studioNotes = (formData.get("studioNotes") as string)?.trim() || null;
  const medium = (formData.get("medium") as string)?.trim() || null;
  const availability = ((formData.get("availability") as string) || "AVAILABLE") as Availability;

  let artwork: { id: string };
  try {
    artwork = await createArtworkWithRetry(artistId, {
      presentationTitle: finalTitle,
      catalogueName: finalTitle,
      type,
      catalogueGroup,
      size,
      location,
      studioNotes,
      medium,
      availability,
      year: yearRaw ? parseInt(yearRaw, 10) : null,
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

