import type { Config } from "@netlify/functions";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { publicMediaUrl, uploadToR2 } from "../../src/lib/r2";
import { APP_URL } from "../../src/lib/appUrl";
import { MEDIA_JOB_SECRET_HEADER, type VideoPosterJob, type VideoPosterReport } from "../../src/lib/mediaJobs";

// Makes still pictures for videos that have none (2026-10-16) — see
// src/lib/videoPosters.ts. A background function (up to 15 minutes):
// asks the app for the next videos waiting, takes a frame from each with
// ffmpeg (reading the video straight from storage, only as much as it
// needs), saves it as a JPEG next to the video in R2 and reports back,
// until none are left or time runs short. ffmpeg comes from the
// ffmpeg-static package (see netlify.toml).

const STOP_AFTER_MS = 12 * 60 * 1000;
const FRAME_TIMEOUT_MS = 60 * 1000;
const POSTER_WIDTH = 600;

// One frame as a JPEG, `atSecond` in; empty if the video is shorter.
function grabFrame(url: string, atSecond: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg isn't available"));
    const ffmpeg = spawn(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(atSecond),
      "-i",
      url,
      "-frames:v",
      "1",
      "-vf",
      `scale='min(${POSTER_WIDTH},iw)':-2`,
      "-q:v",
      "4",
      "-f",
      "image2",
      "-c:v",
      "mjpeg",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let errors = "";
    const timer = setTimeout(() => ffmpeg.kill("SIGKILL"), FRAME_TIMEOUT_MS);
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => (errors += chunk.toString()));
    ffmpeg.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(errors.trim().split("\n").pop() || `ffmpeg stopped (${code})`));
    });
  });
}

async function makePoster(video: VideoPosterJob): Promise<VideoPosterReport> {
  const url = publicMediaUrl(video.key);
  if (!url) return { id: video.id, ok: false, error: "Storage has no public address (R2_PUBLIC_URL)." };
  try {
    // A second in, past any fade from black; the very start if it's shorter.
    let jpeg = await grabFrame(url, 1);
    if (jpeg.length === 0) jpeg = await grabFrame(url, 0);
    if (jpeg.length === 0) return { id: video.id, ok: false, error: "No frame could be read from the video." };
    const posterKey = `${video.key}-poster.jpg`;
    await uploadToR2(posterKey, jpeg, "image/jpeg");
    return { id: video.id, ok: true, posterKey };
  } catch (err) {
    return { id: video.id, ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "Couldn't make a picture." };
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
