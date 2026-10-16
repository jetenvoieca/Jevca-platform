import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { MEDIA_JOB_SECRET_HEADER, type VideoPosterJob } from "@/lib/mediaJobs";

// Still pictures for videos (2026-10-16). A video uploaded through the
// browser gets one there and then, and Video Edit's renders get one from
// Shotstack; every other video (iPhone Shortcut, Studio, CSV import, and
// those from before) gets one from the background function
// netlify/functions/make-video-posters-background.mts, which takes a
// frame with ffmpeg, saves it next to the video in R2 and reports back
// to /api/video-posters. It's started whenever such a video arrives
// (requestVideoPosters) and once an hour as a sweep. A video whose
// picture can't be made keeps the reason (`posterError`) and isn't tried
// again; the catalogue then shows the video's first frame. Server-only.

// The videos still waiting for a picture, oldest first.
export async function videosNeedingPosters(limit: number): Promise<VideoPosterJob[]> {
  return db.image.findMany({
    where: { kind: "VIDEO", posterUrl: null, posterError: null, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true },
    take: limit,
  });
}

export async function recordVideoPoster(
  id: string,
  result: { ok: true; posterKey: string } | { ok: false; error: string }
): Promise<void> {
  await db.image.updateMany({
    where: { id, kind: "VIDEO", posterUrl: null },
    data: result.ok ? { posterUrl: `/api/media/${result.posterKey}` } : { posterError: result.error },
  });
}

// Starts the background function. Best-effort: if it can't start now,
// the hourly sweep does it.
export async function requestVideoPosters(): Promise<void> {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret) return;
  try {
    await fetch(`${APP_URL}/.netlify/functions/make-video-posters-background`, {
      method: "POST",
      headers: { [MEDIA_JOB_SECRET_HEADER]: secret },
      // A redirect means it never reached the function — don't follow it.
      redirect: "manual",
    });
  } catch {
    // Picked up by the sweep.
  }
}
