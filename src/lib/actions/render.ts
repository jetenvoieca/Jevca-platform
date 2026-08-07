"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { readTimeline } from "@/lib/videoTimeline";

// This app's own live URL — used to build absolute image URLs for
// Shotstack to fetch (it can't reach a relative "/api/media/..." path)
// and the webhook callback URL. Update if a custom domain ever fronts
// the admin tool itself.
const HOST = "https://jevca.netlify.app";

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

// Actually fetches the first bit of each file to confirm it's real and
// reachable — catches the case a stored mimeType looks fine but the
// underlying R2 object is missing, empty, or was never fully uploaded
// (a real risk for older items, especially anything from before direct-
// to-R2 upload was solid). Returns null if all good, or a specific,
// nameable problem if not.
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

type ClipWithImage = {
  kind: "PHOTO" | "VIDEO";
  duration?: number;
  trimIn?: number;
  trimOut?: number;
  image: { url: string };
};

// Builds the Shotstack Edit API JSON for a timeline — one track, clips
// placed sequentially. Shotstack positions each clip by an explicit
// start time rather than auto-sequencing, so we compute each one's
// cumulative offset ourselves.
function buildEditJson(clips: ClipWithImage[], callbackUrl: string) {
  let cursor = 0;
  const shotClips = clips.map((clip) => {
    const length =
      clip.kind === "PHOTO"
        ? clip.duration ?? 2
        : Math.max(0.1, (clip.trimOut ?? 0) - (clip.trimIn ?? 0));
    const start = cursor;
    cursor += length;

    const url = toAbsoluteUrl(clip.image.url);

    const asset =
      clip.kind === "PHOTO"
        ? { type: "image" as const, src: url }
        : { type: "video" as const, src: url, trim: clip.trimIn ?? 0 };

    // Shotstack's naming is the reverse of the usual CSS convention:
    // their "cover" STRETCHES the asset to fill the frame, distorting
    // it — their "crop" fills the frame while preserving aspect ratio
    // and cropping any overflow, which is what "fill the frame properly"
    // actually means here. Also confirmed as Shotstack's own default.
    return { asset, start, length, fit: "crop" as const };
  });

  return {
    timeline: { tracks: [{ clips: shotClips }] },
    // 1920x1080 is a reasonable default for now — cropping specifically
    // for Instagram's 9:16 vs the website's likely 16:9 is flagged in
    // bucket-video-editor-design.md as a short follow-up conversation
    // once the core flow is proven, not something to guess at here.
    output: { format: "mp4" as const, size: { width: 1920, height: 1080 } },
    callback: callbackUrl,
  };
}

// Submits the current draft to Shotstack. Returns a plain ok/error
// result rather than throwing — Next.js redacts thrown Server Action
// errors in production, so anything the person needs to actually see
// (a bad clip, a Shotstack rejection) has to come back this way, same
// convention already used for Payments.
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
    select: { id: true, url: true, mimeType: true, caption: true },
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

    const problem = await verifyAssetReachable(toAbsoluteUrl(image.url), clip.kind);
    if (problem) {
      const label = image.caption || "One of the clips";
      return {
        ok: false,
        error: `"${label}" ${problem} — remove it from the strip (the ✕ on its thumbnail) and try again.`,
      };
    }

    clipsWithImages.push({ ...clip, image });
  }

  const env = activeEnv();
  const callbackUrl = `${HOST}/api/shotstack/render-webhook`;
  const editJson = buildEditJson(clipsWithImages, callbackUrl);

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

// The most recent render worth showing something about — in progress,
// just failed, or just finished and not yet named. Returns null once
// there's nothing left to show (e.g. the result has already been named
// — see nameRenderedVideo).
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

// Names the finished video — this is what actually "saves" it, in the
// sense the Media Catalogue cares about (an unnamed/uncaptioned item is
// still perfectly real, just not yet acknowledged in the UI).
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
