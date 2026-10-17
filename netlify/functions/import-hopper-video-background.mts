import type { Config } from "@netlify/functions";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Upload } from "@aws-sdk/lib-storage";
import { r2, R2_BUCKET } from "../../src/lib/r2";
import { APP_URL } from "../../src/lib/appUrl";
import { browserFetchHeaders } from "../../src/lib/importHelpers";
import { MEDIA_JOB_SECRET_HEADER } from "../../src/lib/mediaJobs";
import { type VideoCopyReport, type VideoCopyRequest } from "../../src/lib/hopperVideoCopy";

// Copies one video from a Hopper CSV import into R2 (2026-10-15) — a
// background function, so it can run for up to 15 minutes, far longer
// than a normal request. The video is streamed from its source straight
// to R2 in parts, so a large file never has to fit in memory. Then it
// reports back to the app (/api/hopper/video-import), which creates the
// Hopper item. Started by startHopperVideoImport (lib/hopperVideoImport.ts).

const ATTEMPTS = 3;

async function copy(request: VideoCopyRequest): Promise<void> {
  const headers = browserFetchHeaders(request.sourceUrl);
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(request.sourceUrl, { headers });
      if (!res.ok || !res.body) {
        lastError = `Video fetch failed — HTTP ${res.status}`;
        // A 4xx (other than 429) won't fix itself on retry.
        if (res.status !== 429 && res.status < 500) break;
      } else {
        const upload = new Upload({
          client: r2,
          params: {
            Bucket: R2_BUCKET,
            Key: request.key,
            Body: Readable.fromWeb(res.body as WebReadableStream<Uint8Array>),
            ContentType: request.contentType,
          },
        });
        await upload.done();
        return;
      }
    } catch (err) {
      lastError = `Could not copy the video (${err instanceof Error ? err.message : "network error"})`;
    }
    if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(lastError);
}

async function report(secret: string, body: VideoCopyReport): Promise<void> {
  const res = await fetch(`${APP_URL}/api/hopper/video-import`, {
    method: "POST",
    headers: { "content-type": "application/json", [MEDIA_JOB_SECRET_HEADER]: secret },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.log("[import-hopper-video-background] report failed:", res.status);
}

export default async (request: Request) => {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret || request.headers.get(MEDIA_JOB_SECRET_HEADER) !== secret) return;

  const copyRequest = (await request.json()) as VideoCopyRequest;
  try {
    await copy(copyRequest);
    await report(secret, { importId: copyRequest.importId, ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Could not copy the video.";
    console.log("[import-hopper-video-background]", copyRequest.sourceUrl, error);
    await report(secret, { importId: copyRequest.importId, ok: false, error });
  }
};

export const config: Config = {
  background: true,
};
