"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  readTimeline,
  videoSize,
  fadeSpeedOf,
  musicVolumeChanges,
  totalTimelineSeconds,
  type CaptionLine,
  type CaptionPosition,
  type CaptionStyle,
} from "@/lib/videoTimeline";
import { uploadToR2, deleteFromR2, publicMediaUrl, storedFileUrl } from "@/lib/r2";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { STICKER_MARGIN, type StickerPosition } from "@/lib/stickers";

const HOST = "https://jevca.netlify.app";

// The video's size comes from its shape (2026-10-16 — see VIDEO_SHAPES).
type OutputSize = { width: number; height: number };

// One video at a time, enforced completely (2026-08-08): a render counts
// as "in the way" from the moment it's submitted until it's actually
// resolved — PENDING and RENDERING (still in progress on Shotstack),
// FAILED (needs discarding), or DONE but not yet saved/named. This is
// the single definition used everywhere something could conflict with
// an in-flight render — starting a new one, or adding more clips to the
// next draft while this one hasn't been dealt with yet.
export async function hasUnresolvedRender(artistId: string): Promise<boolean> {
  const unresolved = await db.videoRender.findFirst({
    where: {
      artistId,
      OR: [
        { status: "PENDING" },
        { status: "RENDERING" },
        { status: "FAILED" },
        { status: "DONE", resultImage: { caption: null } },
      ],
    },
  });
  return unresolved != null;
}

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

// Where Shotstack (and the checks before it) fetch a file: straight from
// storage when it has a public address, otherwise through the app.
function toAbsoluteUrl(url: string): string {
  const direct = storedFileUrl(url);
  return direct.startsWith("http") ? direct : `${HOST}${direct}`;
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
  artistId: string,
  size: OutputSize
): Promise<{ url: string; key: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`source image returned ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const jpeg = await sharp(original)
    .rotate()
    .resize(size.width, size.height, { fit: "cover", position: "center" })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 90 })
    .toBuffer();

  const key = `${artistId}/render-tmp/${randomUUID()}.jpg`;
  await uploadToR2(key, jpeg, "image/jpeg");
  return { url: toAbsoluteUrl(`/api/media/${key}`), key };
}

// The sound under the video (2026-10-16/17): the music track at its
// volume, and the voiceover from its start; the music fades in and out
// and dips under the voice (musicVolumeChanges).
type Sound = {
  music: { src: string; volume: number } | null;
  voice: { src: string; start: number; durationSeconds: number; musicUnderVoice: number } | null;
  muteClips: boolean;
};

// Captions (2026-10-17): Shotstack's rich captions, either listening to
// the voiceover clip (alias) or reading an SRT file of the typed lines.
type Captions = {
  source: { fromVoice: true } | { srtUrl: string };
  style: CaptionStyle;
  position: CaptionPosition;
};

const VOICE_ALIAS = "voiceover";

// Typed caption lines as an SRT subtitle file.
function toSrt(lines: CaptionLine[]): string {
  const time = (seconds: number) => {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return lines
    .filter((l) => l.text.trim() && l.end > l.start)
    .sort((a, b) => a.start - b.start)
    .map((l, i) => `${i + 1}\n${time(l.start)} --> ${time(l.end)}\n${l.text.trim()}\n`)
    .join("\n");
}

// The caption clip: white bold words with a dark outline, in the chosen
// look, across most of the video's width.
function captionClip(captions: Captions, size: OutputSize, voice: { start: number; length: number } | null) {
  const looks: Record<CaptionStyle, object> = {
    clean: { animation: { style: "none" } },
    highlight: { animation: { style: "highlight" }, active: { font: { color: "#efbf04" } } },
    karaoke: { animation: { style: "karaoke" }, active: { font: { color: "#efbf04" } } },
    pop: { animation: { style: "pop" }, style: { textTransform: "uppercase" } },
    typewriter: { animation: { style: "typewriter" } },
  };
  const offsetY = captions.position === "top" ? -0.06 : captions.position === "bottom" ? 0.08 : 0;
  const fromVoice = "fromVoice" in captions.source;
  return {
    asset: {
      type: "rich-caption" as const,
      src: fromVoice ? `alias://${VOICE_ALIAS}` : (captions.source as { srtUrl: string }).srtUrl,
      font: { family: "Roboto", size: Math.round(size.width * 0.06), color: "#ffffff", weight: 700 },
      stroke: { width: 3, color: "#000000", opacity: 1 },
      ...looks[captions.style],
    },
    // From the voiceover, the captions run while it does.
    start: voice ? voice.start : 0,
    length: voice ? voice.length : "end",
    width: Math.round(size.width * 0.9),
    height: Math.round(size.height * 0.25),
    position: captions.position,
    offset: { x: 0, y: offsetY },
  };
}

// A sticker made ready for Shotstack: resized to its width in the video,
// and where it sits.
type PreparedSticker = { url: string; position: StickerPosition };

type ClipWithImage = {
  kind: "PHOTO" | "VIDEO";
  duration?: number;
  trimIn?: number;
  trimOut?: number;
  image: { url: string };
  stickers: PreparedSticker[];
};

// Shotstack moves a clip from its spot by a share of the video (x right,
// y up); this keeps a sticker STICKER_MARGIN from the edges it sits by.
function stickerOffset(position: StickerPosition): { x: number; y: number } {
  const x = position.endsWith("Left") || position === "left" ? STICKER_MARGIN : position.endsWith("Right") || position === "right" ? -STICKER_MARGIN : 0;
  const y = position.startsWith("top") ? -STICKER_MARGIN : position.startsWith("bottom") ? STICKER_MARGIN : 0;
  return { x, y };
}

// A sticker's PNG at its width in this video, uploaded for the render.
async function prepareStickerAsset(
  sourceUrl: string,
  artistId: string,
  widthPx: number
): Promise<{ url: string; key: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`sticker returned ${res.status}`);
  const png = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize({ width: widthPx })
    .png()
    .toBuffer();
  const key = `${artistId}/render-tmp/${randomUUID()}.png`;
  await uploadToR2(key, png, "image/png");
  return { url: toAbsoluteUrl(`/api/media/${key}`), key };
}

function clipLength(clip: ClipWithImage): number {
  return clip.kind === "PHOTO"
    ? clip.duration ?? 2
    : Math.max(0.1, (clip.trimOut ?? 0) - (clip.trimIn ?? 0));
}

// The Shotstack edit (2026-10-16 fades): each clip on its own track,
// later clips above earlier ones, each fading in over the one before
// across their overlap (an opacity change, so any length works — Shotstack's
// own fade transitions only come in 0.5, 1 and 2 seconds). Stickers on a
// top track fade in and out with their clip.
function buildEditJson(
  clips: ClipWithImage[],
  callbackUrl: string,
  size: OutputSize,
  sound: Sound,
  fadeSeconds: number,
  captions: Captions | null
) {
  const lengths = clips.map(clipLength);
  const overlapAfter = (i: number) =>
    i === clips.length - 1 ? 0 : Math.min(fadeSeconds, lengths[i], lengths[i + 1]);

  let cursor = 0;
  const stickerClips: object[] = [];
  const shotClips = clips.map((clip, i) => {
    const length = lengths[i];
    const start = cursor;
    const fadeIn = i === 0 ? 0 : overlapAfter(i - 1);
    const fadeOut = overlapAfter(i);
    cursor += length - fadeOut;

    const asset =
      clip.kind === "PHOTO"
        ? { type: "image" as const, src: clip.image.url }
        : {
            type: "video" as const,
            src: clip.image.url,
            trim: clip.trimIn ?? 0,
            ...(sound.muteClips ? { volume: 0 } : {}),
          };

    // Opacity changes, timed within the clip.
    const fadingIn = fadeIn > 0 ? [{ from: 0, to: 1, start: 0, length: fadeIn }] : [];
    const fadingOut = fadeOut > 0 ? [{ from: 1, to: 0, start: length - fadeOut, length: fadeOut }] : [];

    for (const sticker of clip.stickers) {
      stickerClips.push({
        asset: { type: "image" as const, src: sticker.url },
        start,
        length,
        fit: "none" as const,
        position: sticker.position,
        offset: stickerOffset(sticker.position),
        ...(fadingIn.length + fadingOut.length > 0 ? { opacity: [...fadingIn, ...fadingOut] } : {}),
      });
    }

    return {
      asset,
      start,
      length,
      fit: "crop" as const,
      width: size.width,
      height: size.height,
      position: "center" as const,
      ...(fadingIn.length > 0 ? { opacity: fadingIn } : {}),
    };
  });

  // The video's length is where the last clip ends.
  const total = cursor;
  const voice = sound.voice && sound.voice.start < total ? sound.voice : null;
  const voiceLength = voice ? Math.min(voice.durationSeconds, total - voice.start) : 0;
  const audioTracks = [
    ...(sound.music
      ? [
          {
            clips: [
              {
                asset: {
                  type: "audio" as const,
                  src: sound.music.src,
                  volume: musicVolumeChanges(
                    sound.music.volume,
                    total,
                    voice ? { start: voice.start, end: voice.start + voiceLength, level: voice.musicUnderVoice } : null
                  ),
                },
                start: 0,
                length: total,
              },
            ],
          },
        ]
      : []),
    ...(voice
      ? [
          {
            clips: [
              {
                alias: VOICE_ALIAS,
                asset: { type: "audio" as const, src: voice.src, volume: 1 },
                start: voice.start,
                length: voiceLength,
              },
            ],
          },
        ]
      : []),
  ];
  // Captions from the voiceover need it there.
  const captionTrack =
    captions && (!("fromVoice" in captions.source) || voice)
      ? [
          {
            clips: [
              captionClip(
                captions,
                size,
                "fromVoice" in captions.source && voice ? { start: voice.start, length: voiceLength } : null
              ),
            ],
          },
        ]
      : [];

  return {
    timeline: {
      // The first track is the top one: stickers, then the clips, last
      // first; the sound tracks below them.
      tracks: [
        ...captionTrack,
        ...(stickerClips.length > 0 ? [{ clips: stickerClips }] : []),
        ...shotClips.map((clip) => ({ clips: [clip] })).reverse(),
        ...audioTracks,
      ],
    },
    // A still frame 1 second in (2026-10-16), saved as the video's
    // picture in the catalogue (see the render webhook).
    output: { format: "mp4" as const, size, poster: { capture: 1 } },
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

  if (await hasUnresolvedRender(draft.artistId)) {
    return {
      ok: false,
      error: "Save or discard your previous render before starting a new one.",
    };
  }

  const timeline = readTimeline(draft.timeline);
  if (timeline.clips.length === 0) {
    return { ok: false, error: "Add at least one photo or video first." };
  }

  const size = videoSize(timeline.shape);
  const imageIds = [...new Set(timeline.clips.map((c) => c.imageId))];
  const images = await db.image.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, artistId: true, url: true, mimeType: true, caption: true },
  });
  const byId = new Map(images.map((img) => [img.id, img]));

  // The artist's stickers used on the clips (a deleted one is left out).
  const stickerIds = [...new Set(timeline.clips.flatMap((c) => (c.stickers ?? []).map((s) => s.stickerId)))];
  const stickerRows = await db.sticker.findMany({
    where: { artistId: draft.artistId, id: { in: stickerIds } },
    select: { id: true, key: true, name: true },
  });
  const stickerById = new Map(stickerRows.map((s) => [s.id, s]));

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

    const stickers: PreparedSticker[] = [];
    for (const placed of clip.stickers ?? []) {
      const sticker = stickerById.get(placed.stickerId);
      if (!sticker) continue;
      try {
        const prepared = await prepareStickerAsset(
          toAbsoluteUrl(`/api/media/${sticker.key}`),
          draft.artistId,
          Math.round(placed.size * size.width)
        );
        tempKeys.push(prepared.key);
        stickers.push({ url: prepared.url, position: placed.position });
      } catch {
        await Promise.all(tempKeys.map((k) => deleteFromR2(k).catch(() => {})));
        return { ok: false, error: `The sticker "${sticker.name}" couldn't be prepared — remove it and try again.` };
      }
    }

    if (clip.kind === "PHOTO") {
      try {
        const prepared = await prepareImageAsset(absoluteUrl, image.artistId, size);
        tempKeys.push(prepared.key);
        clipsWithImages.push({ ...clip, image: { url: prepared.url }, stickers });
      } catch {
        await Promise.all(tempKeys.map((k) => deleteFromR2(k).catch(() => {})));
        const label = image.caption || "One of the clips";
        return {
          ok: false,
          error: `"${label}" couldn't be processed as an image — the file may be corrupted. Remove it and try again.`,
        };
      }
    } else {
      clipsWithImages.push({ ...clip, image: { url: absoluteUrl }, stickers });
    }
  }

  let music: Sound["music"] = null;
  if (timeline.music) {
    const track = await db.musicTrack.findFirst({
      where: { id: timeline.music.trackId, artistId: draft.artistId },
      select: { key: true },
    });
    if (!track) {
      await Promise.all(tempKeys.map((k) => deleteFromR2(k).catch(() => {})));
      return { ok: false, error: "The chosen music has been deleted — choose another track, or None." };
    }
    music = { src: toAbsoluteUrl(`/api/media/${track.key}`), volume: timeline.music.volume };
  }
  const voice: Sound["voice"] = timeline.voice
    ? { ...timeline.voice, src: toAbsoluteUrl(`/api/media/${timeline.voice.key}`) }
    : null;

  // Typed captions go to Shotstack as an SRT file.
  let captions: Captions | null = null;
  if (timeline.captions?.mode === "voice" && voice) {
    captions = { source: { fromVoice: true }, style: timeline.captions.style, position: timeline.captions.position };
  } else if (timeline.captions?.mode === "typed" && timeline.captions.lines.some((l) => l.text.trim())) {
    const srtKey = `${draft.artistId}/render-tmp/${randomUUID()}.srt`;
    await uploadToR2(srtKey, Buffer.from(toSrt(timeline.captions.lines), "utf8"), "text/plain; charset=utf-8");
    tempKeys.push(srtKey);
    captions = {
      source: { srtUrl: toAbsoluteUrl(`/api/media/${srtKey}`) },
      style: timeline.captions.style,
      position: timeline.captions.position,
    };
  }

  const env = activeEnv();
  const callbackUrl = `${HOST}/api/shotstack/render-webhook`;
  const editJson = buildEditJson(
    clipsWithImages,
    callbackUrl,
    size,
    { music, voice, muteClips: timeline.muteClips === true },
    fadeSpeedOf(timeline.fade).seconds,
    captions
  );

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
  const render = await db.videoRender.findFirst({
    where: { artistId, status: { in: ["PENDING", "RENDERING", "DONE", "FAILED"] } },
    orderBy: { updatedAt: "desc" },
    relationLoadStrategy: "query",
    include: {
      resultImage: {
        select: {
          id: true,
          url: true,
          displayKey: true,
          posterUrl: true,
          kind: true,
          caption: true,
          altText: true,
          tags: true,
          artworkId: true,
          // The artwork's Name — its one and only name (2026-09-23).
          artwork: { select: { id: true, catalogueName: true } },
        },
      },
    },
  });

  if (!render) return null;
  if (render.status === "DONE" && render.resultImage?.caption) return null;

  // The clips that actually went into this specific render, so it can be
  // checked against what was uploaded (2026-08-08) — read from this
  // render's own saved timeline, which is untouched by a fresh draft
  // being created alongside it.
  const timeline = readTimeline(render.timeline);
  const sourceImageIds = [...new Set(timeline.clips.map((c) => c.imageId))];
  const sourceImages =
    sourceImageIds.length > 0
      ? await db.image.findMany({
          where: { id: { in: sourceImageIds } },
          select: { id: true, url: true, posterUrl: true, kind: true, caption: true },
        })
      : [];
  const sourceImageById = new Map(sourceImages.map((img) => [img.id, img]));
  const sourceClips = timeline.clips
    .map((clip) => {
      const image = sourceImageById.get(clip.imageId);
      return image ? { id: clip.id, kind: clip.kind, image } : null;
    })
    .filter((c): c is { id: string; kind: "PHOTO" | "VIDEO"; image: (typeof sourceImages)[number] } => c !== null);

  return {
    id: render.id,
    status: render.status as "PENDING" | "RENDERING" | "DONE" | "FAILED",
    error: render.renderError,
    createdAt: render.createdAt.toISOString(),
    debugPayload: render.debugPayload ? JSON.stringify(render.debugPayload, null, 2) : null,
    sourceClips,
    // 2026-08-18 fix — this render's own clip count/duration, from its
    // own saved timeline (untouched by a fresh draft being created
    // alongside it). Lets the header show real numbers for this render
    // even once the live draft above has moved on and is genuinely
    // empty, instead of "0 clips · 0s total" next to a render that
    // plainly had clips in it.
    clipCount: timeline.clips.length,
    totalSeconds: totalTimelineSeconds(timeline.clips, fadeSpeedOf(timeline.fade).seconds),
    resultImage: render.resultImage
      ? {
          id: render.resultImage.id,
          url: render.resultImage.url,
          displayUrl: publicMediaUrl(render.resultImage.displayKey) || render.resultImage.url,
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
    relationLoadStrategy: "query",
  });
  if (!render) return;

  await db.videoRender.delete({ where: { id: renderId } });
  if (render.resultImage) {
    const { id, key, posterUrl } = render.resultImage;
    await db.image.delete({ where: { id } }).catch(() => {});
    // The video, and its still picture if it has one of its own.
    const posterKey = posterUrl?.startsWith("/api/media/") ? posterUrl.slice("/api/media/".length) : null;
    await Promise.all(
      [key, posterKey].filter((k): k is string => !!k).map((k) => deleteFromR2(k).catch(() => {}))
    );
  }

  revalidatePath(`/sites/${siteId}/bucket`);
}
