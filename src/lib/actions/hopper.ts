"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { appendImageToTimeline } from "./videoEditor";

// None of these actions revalidate /sites/[id]/hopper itself (2026-08-17
// fix) — that page is already force-dynamic (never cached to begin
// with, so revalidatePath had no real purpose there), and every client
// flow that wants an immediate refresh already calls router.refresh()
// explicitly (see advanceAfterAction in HopperView.tsx). Calling
// revalidatePath on the route someone is currently viewing triggers an
// automatic background client refresh regardless of any explicit
// router.refresh() elsewhere — confirmed as the actual cause of a real
// bug: the "Add Artwork" flow's inline quick-catalogue fields (which
// deliberately don't advance the queue right away, so they can be
// filled in) were being wiped out by this auto-refresh moments after
// appearing, before anyone could type into them. Revalidating other
// routes (artworks, bucket) is still correct and kept — those aren't
// the page currently being viewed, so they don't trigger this.

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
  revalidatePath(`/sites/${siteId}/artworks`);
}
