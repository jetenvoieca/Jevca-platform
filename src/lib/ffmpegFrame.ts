import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

// One frame of a video as a JPEG, taken with ffmpeg (from the
// ffmpeg-static package — see netlify.toml), reading the video straight
// from its address, only as much as it needs. Used by the Netlify
// background functions for videos' still pictures (2026-10-16) and Video
// Edit's Grab still (2026-10-17). Empty if the video is shorter than
// `atSecond`. `width` scales it down (never up); left out, full size.
// Server-only.

const FRAME_TIMEOUT_MS = 60 * 1000;

export function grabFrame(
  url: string,
  atSecond: number,
  options: { width?: number; quality: number },
): Promise<Buffer> {
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
      ...(options.width ? ["-vf", `scale='min(${options.width},iw)':-2`] : []),
      "-q:v",
      String(options.quality),
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
