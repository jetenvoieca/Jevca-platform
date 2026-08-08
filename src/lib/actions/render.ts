"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { readTimeline, CROSSFADE_SECONDS } from "@/lib/videoTimeline";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { randomUUID } from "crypto";
import sharp from "sharp";

const HOST = "https://jevca.netlify.app";
const OUTPUT_WIDTH = 1080;
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

async function prepareImageAsset(
  sourceUrl: string,
  artistId: string
): Promise<{ url: string; key: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`source image returned ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const jpeg = await sharp(original)
    .rotate()
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "center" })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 90 })
    .toBuffer();

  const key = `${artistId}/render-tmp/${randomUUID()}.jpg`;
  await uploadToR2(key, jpeg, "image/jpeg");
  return { url: `${HOST}/api/media/${key}`, key };
}

type ClipWithImage = {
  kind: "PHOTO" | "VIDEO";
  duration?: number;
  trimIn?: number;
  trimOut?: number;
  image: { url: string };
};

function clipLength(clip: ClipWithImage): number {
  return clip.kind === "PHOTO"
    ? clip.duration ?? 2
    : Math.max(0.1, (clip.trimOut ?? 0) - (clip.trimIn ?? 0));
}

function buildEditJson(clips: ClipWithImage[], callbackUrl: string) {
  const lengths = clips.map(clipLength);

  let cursor = 0;
  const shotClips = clips.map((clip, i) => {
    const length = lengths[i];
    const start = cursor;
    const isLast = i === clips.length - 1;
    const isFirst = i === 0;
    const overlap = isLast ? 0 : Math.min(CROSSFADE_SECONDS, length, lengths[i + 1]);
    cursor += length - overlap;

    const asset =
      clip.kind === "PHOTO"
        ? { type: "image" as const, src: clip.image.url }
        : { type: "video" as const, src: clip.image.url, trim: clip.trimIn ?? 0 };

    const transition: { in?: "fade"; out?: "fade" } = {};
    if (!isFirst) transition.in = "fade";
    if (!isLast) transition.out = "fade";

    return {
      asset,
      start,
      length,
      fit: "crop" as const,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      position: "center" as const,
      ...(Object.keys(transition).length > 0 ? { transition } : {}),
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

  const unresolved = await db.videoRender.findFirst({
    where: {
      artistId: draft.artistId,
      OR: [{ status: "FAILED" }, { status: "DONE", resultImage: { caption: null } }],
    },
  });
  if (unresolved) {
    return {
      ok: false,
      error: "Save or discard your previous render before starting a new one.",
    };
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
  const tempKeys: string[] = [];

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
        const prepared = await prepareImageAsset(absoluteUrl, image.artistId);
        tempKeys.push(prepared.key);
        clipsWithImages.push({ ...clip, image: { url: prepared.url } });
      } catch {
        await Promise.all(tempKeys.map((k) => deleteFromR2(k).catch(() => {})));
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

  await db.videoRender.update({
    where: { id: renderId },
    data: { debugPayload: editJson, tempAssetKeys: tempKeys },
  });

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
  const [render, queueCount] = await Promise.all([
    db.videoRender.findFirst({
      where: { artistId, status: { in: ["PENDING", "RENDERING", "DONE", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      include: {
        resultImage: {
          select: {
            id: true,
            url: true,
            posterUrl: true,
            kind: true,
            caption: true,
            altText: true,
            tags: true,
            artworkId: true,
            artwork: { select: { id: true, presentationTitle: true } },
          },
        },
      },
    }),
    db.videoRender.count({
      where: {
        artistId,
        OR: [{ status: "FAILED" }, { status: "DONE", resultImage: { caption: null } }],
      },
    }),
  ]);

  if (!render) return null;
  if (render.status === "DONE" && render.resultImage?.caption) return null;

  return {
    id: render.id,
    status: render.status as "PENDING" | "RENDERING" | "DONE" | "FAILED",
    error: render.renderError,
    createdAt: render.createdAt.toISOString(),
    queueCount,
    debugPayload: render.debugPayload ? JSON.stringify(render.debugPayload, null, 2) : null,
    resultImage: render.resultImage
      ? {
          id: render.resultImage.id,
          url: render.resultImage.url,
          posterUrl: render.resultImage.posterUrl,
          kind: render.resultImage.kind,
          caption: render.resultImage.caption,
          altText: render.resultImage.altText,
          tags: render.resultImage.tags,
          artworkId: render.resultImage.artworkId,
          artwork: render.resultImage.artwork,
        }
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

export async function discardRenderResult(siteId: string, renderId: string): Promise<void> {
  const render = await db.videoRender.findUnique({
    where: { id: renderId },
    include: { resultImage: true },
  });
  if (!render) return;

  await db.videoRender.delete({ where: { id: renderId } });
  if (render.resultImage) {
    await db.image.delete({ where: { id: render.resultImage.id } }).catch(() => {});
    await deleteFromR2(render.resultImage.key).catch(() => {});
  }

  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function discardAllPreviousRenders(
  siteId: string,
  currentDraftRenderId: string
): Promise<number> {
  const draft = await db.videoRender.findUnique({
    where: { id: currentDraftRenderId },
    select: { artistId: true },
  });
  if (!draft) return 0;

  const toDelete = await db.videoRender.findMany({
    where: {
      artistId: draft.artistId,
      OR: [{ status: "FAILED" }, { status: "DONE", resultImage: { caption: null } }],
    },
    include: { resultImage: true },
  });

  await db.videoRender.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });

  const imagesToDelete = toDelete.map((r) => r.resultImage).filter((img): img is NonNullable<typeof img> => !!img);
  if (imagesToDelete.length > 0) {
    await db.image.deleteMany({ where: { id: { in: imagesToDelete.map((img) => img.id) } } });
    await Promise.all(imagesToDelete.map((img) => deleteFromR2(img.key).catch(() => {})));
  }

  revalidatePath(`/sites/${siteId}/bucket`);
  return toDelete.length;
}
