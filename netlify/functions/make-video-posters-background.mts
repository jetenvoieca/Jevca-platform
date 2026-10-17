import type { Config } from "@netlify/functions";
import { grabFrame } from "../../src/lib/ffmpegFrame";
import { publicMediaUrl, uploadToR2 } from "../../src/lib/r2";
import { APP_URL } from "../../src/lib/appUrl";
import { MEDIA_JOB_SECRET_HEADER, type VideoPosterJob, type VideoPosterReport } from "../../src/lib/mediaJobs";

// Makes still pictures for videos that have none (2026-10-16) — see
// src/lib/videoPosters.ts. A background function (up to 15 minutes):
// asks the app for the next videos waiting, takes a frame from each with
// ffmpeg (reading the video straight from storage, only as much as it
// needs — src/lib/ffmpegFrame.ts), saves it as a JPEG next to the video
// in R2 and reports back, until none are left or time runs short.

const STOP_AFTER_MS = 12 * 60 * 1000;
const POSTER_WIDTH = 600;

async function makePoster(video: VideoPosterJob): Promise<VideoPosterReport> {
  const url = publicMediaUrl(video.key);
  if (!url) return { id: video.id, ok: false, error: "Storage has no public address (R2_PUBLIC_URL)." };
  try {
    // A second in, past any fade from black; the very start if it's shorter.
    let jpeg = await grabFrame(url, 1, { width: POSTER_WIDTH, quality: 4 });
    if (jpeg.length === 0) jpeg = await grabFrame(url, 0, { width: POSTER_WIDTH, quality: 4 });
    if (jpeg.length === 0) return { id: video.id, ok: false, error: "No frame could be read from the video." };
    const posterKey = `${video.key}-poster.jpg`;
    await uploadToR2(posterKey, jpeg, "image/jpeg");
    return { id: video.id, ok: true, posterKey };
  } catch (err) {
    return {
      id: video.id,
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : "Couldn't make a picture.",
    };
  }
}

export default async (request: Request) => {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret || request.headers.get(MEDIA_JOB_SECRET_HEADER) !== secret) return;
  const headers = { [MEDIA_JOB_SECRET_HEADER]: secret };
  const startedAt = Date.now();

  while (Date.now() - startedAt < STOP_AFTER_MS) {
    const res = await fetch(`${APP_URL}/api/video-posters`, { headers });
    if (!res.ok) {
      console.log("[make-video-posters] couldn't get the list:", res.status);
      return;
    }
    const { videos } = (await res.json()) as { videos: VideoPosterJob[] };
    if (videos.length === 0) return;
    for (const video of videos) {
      const report = await makePoster(video);
      if (!report.ok) console.log("[make-video-posters]", video.key, report.error);
      await fetch(`${APP_URL}/api/video-posters`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(report),
      });
    }
  }
};

export const config: Config = {
  background: true,
};
