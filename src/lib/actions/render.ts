"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { readTimeline } from "@/lib/videoTimeline";
import { uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";
import sharp from "sharp";

// This app's own live URL — used to build absolute image URLs for
// Shotstack to fetch (it can't reach a relative "/api/media/..." path)
// and the webhook callback URL. Update if a custom domain ever fronts
// the admin tool itself.
const HOST = "https://jevca.netlify.app";

// The output canvas for every render — referenced directly by each clip
// too (see buildEditJson) rather than left to Shotstack's implicit
// per-clip default.
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

type ShotstackEnv = "stage" | "v1";

function shotstackHost(env: ShotstackEnv) {
  return `https://api.shotstack.io/edit/${env}`;
}

function apiKeyFor(env: ShotstackEnv): string {
  return env === "v1"
    ? process.env.SHOTSTACK_API_KEY_PRODUCTION!
    : process.env.SHOTSTACK_API_KEY_STAGE!;
}

// The one on/off switch for going live — flip SHOTSTACK_ENV in Netlify
// from "stage" to "v1" once you're happy with render quality. No code
// change needed either side of that.
function activeEnv(): ShotstackEnv {
  return process.env.SHOTSTACK_ENV === "v1" ? "v1" : "stage";
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const SUPPORTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

function toAbsoluteUrl(url: string): string {
  return url.startsWith("http") ? url : `${HOST}${url}`;
}

function formatError(caption: string | null, mimeType: string): string {
  const label = caption || "One of the clips";
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return `"${label}" is a HEIC photo, which Shotstack can't render. Remove it from the strip (the ✕ on its thumbnail), or re-save it as a JPEG and re-add it, then try again.`;
  }
  return `"${label}" is in a format Shotstack can't render (${mimeType}). Remove it from the strip and try again.`;
}

async function verifyAssetReachable(url: string, kind: "PHOTO" | "VIDEO"): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-2048" } });
    if (!res.ok && res.status !== 206) {
      return `couldn't be loaded (server returned ${res.status})`;
    }
    const contentType = res.headers.get("content-type") || "";
    const expectedPrefix = kind === "PHOTO" ? "image/" : "video/";
    if (!contentType.startsWith(expectedPrefix)) {
      return `doesn't look like a real ${kind === "PHOTO" ? "image" : "video"} file`;
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) === 0) {
      return "is an empty file (0 bytes) — the original upload likely never completed";
    }
  } catch {
    return "couldn't be reached";
  }
  return null;
}

// Re-encodes a photo into a plain, flattened, sRGB baseline JPEG before
// handing it to Shotstack. `.rotate()` with no arguments is the critical
// piece here: many phone photos store raw sensor pixels sideways plus an
// invisible EXIF "Orientation" tag telling viewers to rotate on display.
// Browsers do this automatically, which is why the photo always looked
// correct up to this point — but without calling `.rotate()` explicitly,
// sharp does NOT apply that correction, so the file handed to Shotstack
// was the still-sideways original with the correction silently dropped.
// `.rotate()` bakes the correction into the actual pixels and removes
// the now-redundant tag, so every downstream consumer (including
// Shotstack) sees it the same way a browser always did.
async function prepareImageAsset(sourceUrl: string, artistId: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`source image returned ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const jpeg = await sharp(original)
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 90 })
    .toBuffer();

  const key = `${artistId}/render-tmp/${randomUUID()}.jpg`;
  await uploadToR2(key, jpeg, "image/jpeg");
  return `${HOST}/api/media/${key}`;
}

type ClipWithImage = {
  kind: "PHOTO" | "VIDEO";
  duration?: number;
  trimIn?: number;
  trimOut?: number;
  image: { url: string };
};

function buildEditJson(clips: ClipWithImage[], callbackUrl: string) {
  let cursor = 0;
  const shotClips = clips.map((clip) => {
    const length =
      clip.kind === "PHOTO"
        ? clip.duration ?? 2
        : Math.max(0.1, (clip.trimOut ?? 0) - (clip.trimIn ?? 0));
    const start = cursor;
    cursor += length;

    const asset =
      clip.kind === "PHOTO"
        ? { type: "image" as const, src: clip.image.url }
        : { type: "video" as const, src: clip.image.url, trim: clip.trimIn ?? 0 };

    return {
      asset,
      start,
      length,
      fit: "crop" as const,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      position: "center" as const,
    };
  });

  return {
    timeline: { tracks: [{ clips: shotClips }] },
    output: { format: "mp4" as const, size: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT } },
    callback: callbackUrl,
  };
}

export async function renderVideo(
  siteId: string,
  renderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") {
    return { ok: false, error: "This video isn't in a state that can be rendered." };
  }

  const timeline = readTimeline(draft.timeline);
  if (timeline.clips.length === 0) {
    return { ok: false, error: "Add at least one photo or video first." };
  }

  const imageIds = [...new Set(timeline.clips.map((c) => c.imageId))];
  const images = await db.image.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, artistId: true, url: true, mimeType: true, caption: true },
  });
  const byId = new Map(images.map((img) => [img.id, img]));

  const clipsWithImages: ClipWithImage[] = [];
  for (const clip of timeline.clips) {
    const image = byId.get(clip.imageId);
    if (!image) return { ok: false, error: "One of the clips is missing its source file." };

    const allowed = clip.kind === "PHOTO" ? SUPPORTED_IMAGE_TYPES : SUPPORTED_VIDEO_TYPES;
    if (!allowed.has(image.mimeType)) {
      return { ok: false, error: formatError(image.caption, image.mimeType) };
    }

    if (clip.kind === "VIDEO" && (clip.trimIn == null || clip.trimOut == null)) {
      return {
        ok: false,
        error:
          "One of the video clips hasn't finished loading yet — open it in the strip first, then try again.",
      };
    }

    const absoluteUrl = toAbsoluteUrl(image.url);
    const problem = await verifyAssetReachable(absoluteUrl, clip.kind);
    if (problem) {
      const label = image.caption || "One of the clips";
      return {
        ok: false,
        error: `"${label}" ${problem} — remove it from the strip (the ✕ on its thumbnail) and try again.`,
      };
    }

    if (clip.kind === "PHOTO") {
      try {
        const safeUrl = await prepareImageAsset(absoluteUrl, image.artistId);
        clipsWithImages.push({ ...clip, image: { url: safeUrl } });
      } catch {
        const label = image.caption || "One of the clips";
        return {
          ok: false,
          error: `"${label}" couldn't be processed as an image — the file may be corrupted. Remove it and try again.`,
        };
      }
    } else {
      clipsWithImages.push({ ...clip, image: { url: absoluteUrl } });
    }
  }

  const env = activeEnv();
  const callbackUrl = `${HOST}/api/shotstack/render-webhook`;
  const editJson = buildEditJson(clipsWithImages, callbackUrl);

  // Temporary diagnostic: prints the exact JSON sent to Shotstack into
  // this function's Netlify log. If anything still looks visually wrong
  // after a render, find this invocation under Netlify's Functions tab
  // and paste the logged JSON back — that shows exactly what was
  // submitted rather than what we assume was submitted.
  console.log("[shotstack] submitting edit:", JSON.stringify(editJson, null, 2));

  let response: Response;
  try {
    response = await fetch(`${shotstackHost(env)}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKeyFor(env) },
      body: JSON.stringify(editJson),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Shotstack — check your connection and try again." };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const message = body?.message || body?.response?.error || "Shotstack rejected the render request.";
    return { ok: false, error: String(message) };
  }

  const shotstackRenderId = body.response.id as string;

  await db.videoRender.update({
    where: { id: renderId },
    data: { status: "PENDING", shotstackRenderId, renderEnv: env, renderError: null },
  });

  revalidatePath(`/sites/${siteId}/bucket`);
  return { ok: true };
}

export async function getRenderStatus(artistId: string) {
  const render = await db.videoRender.findFirst({
    where: { artistId, status: { in: ["PENDING", "RENDERING", "DONE", "FAILED"] } },
    orderBy: { updatedAt: "desc" },
    include: { resultImage: true },
  });
  if (!render) return null;
  if (render.status === "DONE" && render.resultImage?.caption) return null;

  return {
    id: render.id,
    status: render.status as "PENDING" | "RENDERING" | "DONE" | "FAILED",
    error: render.renderError,
    resultImage: render.resultImage
      ? { id: render.resultImage.id, url: render.resultImage.url }
      : null,
  };
}

export async function nameRenderedVideo(
  siteId: string,
  imageId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  await db.image.update({
    where: { id: imageId },
    data: { caption: trimmed || "Untitled video" },
  });
  revalidatePath(`/sites/${siteId}/bucket`);
  revalidatePath(`/sites/${siteId}/media`);
}
