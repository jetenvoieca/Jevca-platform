"use server";

import { db } from "@/lib/db";
import { getFromR2, uploadToR2 } from "@/lib/r2";
import { generateImageSizes } from "@/lib/imageSizes";
import { revalidatePath } from "next/cache";

// One-off backfill for every PHOTO uploaded before the thumbnail/display
// pipeline existed (2026-08-13 — see decisions log). Deliberately
// processes one image per call rather than looping through all of them
// in a single request — the same reasoning as the CSV import (a single
// request resizing ~100 images could exceed a serverless function's
// execution time limit), and the client-side loop gives real, visible
// progress instead of one opaque "please wait".

export async function getBackfillCount(artistId: string): Promise<number> {
  return db.image.count({
    where: { artistId, kind: "PHOTO", thumbnailKey: null },
  });
}

export async function backfillOneImage(
  artistId: string,
  excludeIds: string[] = []
): Promise<{ done: true } | { done: false; imageId: string; ok: boolean; error?: string }> {
  const next = await db.image.findFirst({
    where: { artistId, kind: "PHOTO", thumbnailKey: null, id: { notIn: excludeIds } },
    select: { id: true, key: true },
  });
  if (!next) return { done: true };

  try {
    const original = await getFromR2(next.key);
    if (!original.Body) {
      throw new Error("Original file not found in storage");
    }
    const bytes = await original.Body.transformToByteArray();
    const sizes = await generateImageSizes(Buffer.from(bytes));
    const thumbnailKey = `${next.key}-thumb.jpg`;
    const displayKey = `${next.key}-display.jpg`;
    await Promise.all([
      uploadToR2(thumbnailKey, sizes.thumbnail, sizes.contentType),
      uploadToR2(displayKey, sizes.display, sizes.contentType),
    ]);
    await db.image.update({
      where: { id: next.id },
      data: { thumbnailKey, displayKey },
    });
    return { done: false, imageId: next.id, ok: true };
  } catch (err) {
    // Left null on failure — every read path already falls back safely
    // to the original url when thumbnailKey is null, so this is no
    // worse off than before the backfill ran. The client-side loop
    // bounds itself by the count fetched at the start (not "loop until
    // done"), so a failing image can't cause an infinite retry loop.
    return {
      done: false,
      imageId: next.id,
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function refreshMediaAfterBackfill(siteId: string) {
  revalidatePath(`/sites/${siteId}/media`);
  revalidatePath(`/sites/${siteId}/artworks`);
}
