import type { Config } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { publicMediaUrl, uploadToR2 } from "../../src/lib/r2";
import { APP_URL } from "../../src/lib/appUrl";
import { grabFrame } from "../../src/lib/ffmpegFrame";
import { MEDIA_JOB_SECRET_HEADER, type VideoStillJob, type VideoStillReport } from "../../src/lib/mediaJobs";

// Video Edit's Grab still (2026-10-17) — see grabVideoStill in
// src/lib/actions/videoEditor.ts. Takes one frame of the video at full
// size with ffmpeg, saves it as a JPEG in R2 and reports back to
// /api/video-stills, which puts it in the artist's Hopper.

const JPEG_QUALITY = 2;

async function grabStill(job: VideoStillJob): Promise<VideoStillReport> {
  const base = { artistId: job.artistId, caption: job.caption };
  const url = publicMediaUrl(job.videoKey);
  if (!url) return { ...base, ok: false, error: "Storage has no public address (R2_PUBLIC_URL)." };
  try {
    const jpeg = await grabFrame(url, job.atSecond, { quality: JPEG_QUALITY });
    if (jpeg.length === 0) return { ...base, ok: false, error: "No frame could be read at that point." };
    const key = `${job.artistId}/${randomUUID()}-still.jpg`;
    await uploadToR2(key, jpeg, "image/jpeg");
    return { ...base, ok: true, key };
  } catch (err) {
    return { ...base, ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "Couldn't take the still." };
  }
}

export default async (request: Request) => {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret || request.headers.get(MEDIA_JOB_SECRET_HEADER) !== secret) return;
  const job = (await request.json().catch(() => null)) as VideoStillJob | null;
  if (!job?.artistId || !job.videoKey || typeof job.atSecond !== "number") return;

  const report = await grabStill(job);
  if (!report.ok) console.log("[grab-video-still]", job.videoKey, report.error);
  await fetch(`${APP_URL}/api/video-stills`, {
    method: "POST",
    headers: { [MEDIA_JOB_SECRET_HEADER]: secret, "content-type": "application/json" },
    body: JSON.stringify(report),
  });
};

export const config: Config = {
  background: true,
};
