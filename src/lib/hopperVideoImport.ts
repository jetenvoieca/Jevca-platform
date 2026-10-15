import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { extensionForContentType } from "@/lib/importHelpers";
import { MEDIA_IMPORT_SECRET_HEADER, type VideoCopyRequest } from "@/lib/hopperVideoCopy";

// Videos in the Hopper's CSV import (2026-10-15). A video is too big to
// copy within a normal request (60 seconds on Netlify), so each one is
// handed to a background function (up to 15 minutes), which copies it
// from its source straight into R2 and then reports back to
// /api/hopper/video-import. A HopperVideoImport row tracks every copy;
// the Hopper item (an Image, status HOPPER) is only created once the
// copy has finished. Background function and report route are both
// protected by MEDIA_IMPORT_SECRET (a Netlify environment variable).

// A copy still "COPYING" after this long has stopped — the background
// function's own limit is 15 minutes.
const STALE_AFTER_MS = 16 * 60 * 1000;

// Records the copy and starts the background function. Returns the
// import's id, or an error if it couldn't be started.
export async function startHopperVideoImport(
  artistId: string,
  sourceUrl: string,
  title: string,
  contentType: string
): Promise<{ importId: string } | { error: string }> {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret) return { error: "Video import isn't set up yet (MEDIA_IMPORT_SECRET is missing in Netlify)." };

  const key = `${artistId}/${randomUUID()}-import.${extensionForContentType(contentType)}`;
  const job = await db.hopperVideoImport.create({
    data: { artistId, sourceUrl, title: title || null, key, mimeType: contentType },
  });

  const request: VideoCopyRequest = { importId: job.id, sourceUrl, key, contentType };
  try {
    const res = await fetch(`${APP_URL}/.netlify/functions/import-hopper-video-background`, {
      method: "POST",
      headers: { "content-type": "application/json", [MEDIA_IMPORT_SECRET_HEADER]: secret },
      body: JSON.stringify(request),
      // A redirect means it never reached the function — don't follow it.
      redirect: "manual",
    });
    // A background function answers 202 straight away.
    if (res.status !== 202) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const error = `Couldn't start the video copy (${err instanceof Error ? err.message : "network error"}).`;
    await db.hopperVideoImport.update({ where: { id: job.id }, data: { status: "FAILED", error } });
    return { error };
  }
  return { importId: job.id };
}

// The background function's report: on success the Hopper item is
// created; on failure the reason is kept. Only a copy still in progress
// is changed, so a repeated report does nothing.
export async function finishHopperVideoImport(
  importId: string,
  result: { ok: true } | { ok: false; error: string }
): Promise<void> {
  const job = await db.hopperVideoImport.findUnique({ where: { id: importId } });
  if (!job || job.status !== "COPYING") return;

  if (!result.ok) {
    await db.hopperVideoImport.update({
      where: { id: importId },
      data: { status: "FAILED", error: result.error },
    });
    return;
  }

  await db.$transaction(async (tx) => {
    const image = await tx.image.create({
      data: {
        artistId: job.artistId,
        key: job.key,
        url: `/api/media/${job.key}`,
        kind: "VIDEO",
        mimeType: job.mimeType,
        status: "HOPPER",
        source: "CSV import",
        caption: job.title,
      },
    });
    await tx.hopperVideoImport.update({
      where: { id: importId },
      data: { status: "DONE", imageId: image.id },
    });
  });
}

export type HopperVideoImportState = {
  id: string;
  status: "COPYING" | "DONE" | "FAILED";
  error: string | null;
};

// Where the given copies have got to. A copy that has been going for
// longer than the background function can run is marked failed.
export async function hopperVideoImportStates(
  artistId: string,
  ids: string[]
): Promise<HopperVideoImportState[]> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  await db.hopperVideoImport.updateMany({
    where: { artistId, id: { in: ids }, status: "COPYING", createdAt: { lt: staleBefore } },
    data: { status: "FAILED", error: "The copy didn't finish — the video may be too large or its site too slow." },
  });
  return db.hopperVideoImport.findMany({
    where: { artistId, id: { in: ids } },
    select: { id: true, status: true, error: true },
  });
}
