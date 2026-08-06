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

    const url = clip.image.url.startsWith("http") ? clip.image.url : `${HOST}${clip.image.url}`;

    const asset =
      clip.kind === "PHOTO"
        ? { type: "image" as const, src: url }
        : { type: "video" as const, src: url, trim: clip.trimIn ?? 0 };

    return { asset, start, length, fit: "cover" as const };
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
    select: { id: true, url: true },
  });
  const byId = new Map(images.map((img) => [img.id, img]));

  const clipsWithImages: ClipWithImage[] = [];
  for (const clip of timeline.clips) {
    const image = byId.get(clip.imageId);
    if (!image) return { ok: false, error: "One of the clips is missing its source file." };
    if (clip.kind === "VIDEO" && (clip.trimIn == null || clip.trimOut == null)) {
      return {
        ok: false,
        error:
          "One of the video clips hasn't finished loading yet — open it in the strip first, then try again.",
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
    // The `where` clause above already excludes DRAFT — this cast just
    // tells TypeScript what it can't infer from the query itself, so it
    // matches the narrower type VideoEditorView expects.
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
