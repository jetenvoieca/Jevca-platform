"use server";

import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import {
  STICKER_SIZE_MAX,
  STICKER_SIZE_MIN,
  isStickerPosition,
  type ClipSticker,
} from "@/lib/stickers";
import {
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  isFadeSpeed,
  isVideoShape,
  readTimeline,
  type Timeline,
  type TimelineCaptions,
  type TimelineClip,
  type FadeSpeed,
  type TimelineMusic,
  type TimelineVoice,
  type VideoShape,
} from "@/lib/videoTimeline";
import { hasUnresolvedRender } from "./render";
import { deleteFromR2, getPresignedUploadUrl } from "@/lib/r2";
import { MUSIC_TYPES } from "@/lib/musicTracks";
import { APP_URL } from "@/lib/appUrl";
import { MEDIA_JOB_SECRET_HEADER, type VideoStillJob } from "@/lib/mediaJobs";

async function getOrCreateDraft(artistId: string) {
  const existing = await db.videoRender.findFirst({
    where: { artistId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return db.videoRender.create({
    data: { artistId, status: "DRAFT", timeline: { clips: [] } },
  });
}

async function saveTimeline(renderId: string, timeline: Timeline): Promise<void> {
  await db.videoRender.update({ where: { id: renderId }, data: { timeline } });
}

// One video at a time, full stop (reconfirmed emphatically 2026-08-08,
// after this function's own self-heal logic was the actual cause of what
// looked like "stacking"): this reads exactly what's in the current
// draft's own saved timeline and nothing else. It never scans for other
// images, never infers what "should" be here, never writes to the
// timeline. Save or Discard finishing a render, followed by the user
// explicitly choosing images in the Hopper, are the ONLY two ways
// anything is ever supposed to land in a draft.
export async function getDraftTimeline(artistId: string) {
  await requireArtistAccess(artistId);
  const draft = await getOrCreateDraft(artistId);
  const timeline = readTimeline(draft.timeline);

  const imageIds = [...new Set(timeline.clips.map((c) => c.imageId))];
  const images = await db.image.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, url: true, posterUrl: true, kind: true, caption: true },
  });
  const byId = new Map(images.map((img) => [img.id, img]));

  const clips = timeline.clips
    .map((clip) => {
      const image = byId.get(clip.imageId);
      return image ? { ...clip, image } : null;
    })
    .filter((c): c is TimelineClip & { image: (typeof images)[number] } => c !== null);

  return {
    renderId: draft.id,
    clips,
    shape: timeline.shape ?? "square",
    music: timeline.music ?? null,
    voice: timeline.voice ?? null,
    muteClips: timeline.muteClips ?? false,
    captions: timeline.captions ?? null,
  };
}

// Captions (2026-10-17): from the voiceover, or typed lines with their
// times; null removes them.
const MAX_CAPTION_LINES = 100;
const MAX_CAPTION_TEXT = 200;

export async function setTimelineCaptions(
  siteId: string,
  renderId: string,
  captions: TimelineCaptions | null
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  if (captions) {
    if (captions.mode !== "voice" && captions.mode !== "typed") return;
    if (!CAPTION_STYLES.some((s) => s.value === captions.style)) return;
    if (!CAPTION_POSITIONS.some((p) => p.value === captions.position)) return;
    const lines = Array.isArray(captions.lines) ? captions.lines.slice(0, MAX_CAPTION_LINES) : [];
    timeline.captions = {
      mode: captions.mode,
      style: captions.style,
      position: captions.position,
      lines: lines.map((l) => {
        const start = Math.max(0, Number(l.start) || 0);
        return {
          id: String(l.id).slice(0, 40),
          text: String(l.text ?? "").slice(0, MAX_CAPTION_TEXT),
          start,
          end: Math.max(start, Number(l.end) || 0),
        };
      }),
    };
  } else {
    delete timeline.captions;
  }
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// The voiceover (2026-10-17). Uploads go straight from the browser to R2
// (a recording is made into a WAV in the browser first): requestVoiceUpload,
// then setTimelineVoice with what was uploaded.
const VOICE_TYPES = ["audio/wav", ...MUSIC_TYPES];

export async function requestVoiceUpload(
  artistId: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  await requireArtistAccess(artistId);
  if (!VOICE_TYPES.includes(contentType)) return { error: "A voiceover must be a WAV, MP3 or M4A file." };
  const extension = contentType === "audio/mpeg" ? "mp3" : contentType.includes("wav") ? "wav" : "m4a";
  const key = `${artistId}/voice/${randomUUID()}.${extension}`;
  return { uploadUrl: await getPresignedUploadUrl(key, contentType), key };
}

// Sets (or, with null, removes) the voiceover; a replaced recording's
// file is deleted.
export async function setTimelineVoice(siteId: string, renderId: string, voice: TimelineVoice | null): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  if (voice && !voice.key.startsWith(`${draft.artistId}/voice/`)) return;
  const previousKey = timeline.voice?.key;
  if (voice) {
    timeline.voice = {
      key: voice.key,
      durationSeconds: Math.max(0, Number(voice.durationSeconds) || 0),
      start: Math.max(0, Number(voice.start) || 0),
      musicUnderVoice: Math.min(1, Math.max(0, Number(voice.musicUnderVoice) || 0)),
    };
  } else {
    delete timeline.voice;
  }
  await saveTimeline(renderId, timeline);
  if (previousKey && previousKey !== voice?.key) await deleteFromR2(previousKey).catch(() => {});
  revalidatePath(`/sites/${siteId}/bucket`);
}

// How a clip changes into the next one (2026-10-17).
export async function setClipFade(siteId: string, renderId: string, clipId: string, fade: FadeSpeed): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  if (!isFadeSpeed(fade)) return;
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;
  clip.fade = fade;
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// The same change between every clip ("All clips").
export async function setAllClipFades(siteId: string, renderId: string, fade: FadeSpeed): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  if (!isFadeSpeed(fade)) return;
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  for (const clip of timeline.clips) clip.fade = fade;
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// A clip's picture stickers (2026-10-16) — only the artist's own, in one
// of the nine spots, at a size within the limits; at most 5 on a clip.
const MAX_STICKERS_PER_CLIP = 5;

export async function setClipStickers(
  siteId: string,
  renderId: string,
  clipId: string,
  stickers: ClipSticker[]
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const own = await db.sticker.findMany({
    where: { artistId: draft.artistId, id: { in: stickers.map((s) => s.stickerId) } },
    select: { id: true },
  });
  const ownIds = new Set(own.map((s) => s.id));
  clip.stickers = stickers
    .filter((s) => ownIds.has(s.stickerId) && isStickerPosition(s.position) && typeof s.id === "string")
    .slice(0, MAX_STICKERS_PER_CLIP)
    .map((s) => ({
      id: s.id,
      stickerId: s.stickerId,
      position: s.position,
      size: Math.min(STICKER_SIZE_MAX, Math.max(STICKER_SIZE_MIN, Number(s.size) || STICKER_SIZE_MIN)),
    }));
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// The video's music (2026-10-16): a track of the artist's (or none), its
// volume, and whether the clips' own sound is muted.
export async function setTimelineMusic(
  siteId: string,
  renderId: string,
  music: TimelineMusic | null,
  muteClips: boolean
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  if (music) {
    const track = await db.musicTrack.findFirst({
      where: { id: music.trackId, artistId: draft.artistId },
      select: { id: true },
    });
    if (!track) return;
    timeline.music = { trackId: track.id, volume: Math.min(1, Math.max(0, music.volume)) };
  } else {
    delete timeline.music;
  }
  timeline.muteClips = muteClips === true;
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// The video's shape (2026-10-16).
export async function setTimelineShape(siteId: string, renderId: string, shape: VideoShape): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  if (!isVideoShape(shape)) return;
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  timeline.shape = shape;
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function appendImageToTimeline(
  artistId: string,
  siteId: string,
  imageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireArtistAccess(artistId);
  // One video at a time (2026-08-08): nothing gets added to the next
  // draft while a previous render is still in progress or waiting to be
  // saved/discarded — that's exactly the "stacking" that isn't wanted.
  if (await hasUnresolvedRender(artistId)) {
    return {
      ok: false,
      error: "A render is in progress — finish reviewing it (Save or Discard) before adding more.",
    };
  }

  const image = await db.image.findFirst({ where: { id: imageId, artistId }, select: { kind: true } });
  if (!image) return { ok: false, error: "That item couldn't be found." };

  await db.image.update({ where: { id: imageId }, data: { status: "BUCKET" } });

  const draft = await getOrCreateDraft(artistId);
  const timeline = readTimeline(draft.timeline);

  const clip: TimelineClip =
    image.kind === "PHOTO"
      ? { id: randomUUID(), imageId, kind: "PHOTO", duration: 2 }
      : { id: randomUUID(), imageId, kind: "VIDEO" };

  timeline.clips.push(clip);
  await saveTimeline(draft.id, timeline);

  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/bucket`);
  return { ok: true };
}

// The video editor's own Add Media (2026-10-15): media and artworks
// (their Main image, else their first) picked together, added to the
// end of the draft in that order. Unlike appendImageToTimeline this
// leaves each image where it is — they're already in the Media
// Catalogue or on their artwork. Only this artist's own.
export async function addPicksToTimeline(
  artistId: string,
  siteId: string,
  picks: { imageIds: string[]; artworkIds: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireArtistAccess(artistId);
  if (await hasUnresolvedRender(artistId)) {
    return {
      ok: false,
      error: "A render is in progress — finish reviewing it (Save or Discard) before adding more.",
    };
  }

  const artworks = await db.artwork.findMany({
    where: { id: { in: picks.artworkIds }, artistId },
    select: { id: true, mainImageId: true, images: { take: 1, select: { id: true } } },
  });
  const artworkImageIds = picks.artworkIds.flatMap((id) => {
    const artwork = artworks.find((a) => a.id === id);
    const imageId = artwork?.mainImageId ?? artwork?.images[0]?.id;
    return imageId ? [imageId] : [];
  });
  const imageIds = [...picks.imageIds, ...artworkImageIds];

  const images = await db.image.findMany({
    where: { id: { in: imageIds }, artistId },
    select: { id: true, kind: true },
  });
  const kindById = new Map(images.map((img) => [img.id, img.kind]));

  const draft = await getOrCreateDraft(artistId);
  const timeline = readTimeline(draft.timeline);
  for (const imageId of imageIds) {
    const kind = kindById.get(imageId);
    if (!kind) continue;
    timeline.clips.push(
      kind === "PHOTO"
        ? { id: randomUUID(), imageId, kind: "PHOTO", duration: 2 }
        : { id: randomUUID(), imageId, kind: "VIDEO" }
    );
  }
  await saveTimeline(draft.id, timeline);

  revalidatePath(`/sites/${siteId}/bucket`);
  return { ok: true };
}

export async function addMediaToBucket(
  imageId: string,
  siteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRecordAccess(db.image.findUnique({ where: { id: imageId }, select: { artistId: true } }));
  const image = await db.image.findUnique({ where: { id: imageId }, select: { artistId: true } });
  if (!image) return { ok: false, error: "That item couldn't be found." };
  const result = await appendImageToTimeline(image.artistId, siteId, imageId);
  if (result.ok) revalidatePath(`/sites/${siteId}/media`);
  return result;
}

export async function removeClipFromTimeline(
  siteId: string,
  renderId: string,
  clipId: string
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);

  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;

  const nextClips = timeline.clips.filter((c) => c.id !== clipId);
  const stillUsed = nextClips.some((c) => c.imageId === clip.imageId);

  await db.$transaction([
    db.videoRender.update({ where: { id: renderId }, data: { timeline: { clips: nextClips } } }),
    ...(stillUsed
      ? []
      : [db.image.update({ where: { id: clip.imageId }, data: { status: "SORTED" as const } })]),
  ]);

  revalidatePath(`/sites/${siteId}/bucket`);
}

// Manually resets the current draft to completely empty — every clip
// removed, each underlying Image returned to ordinary Sorted media.
// Needed as a genuine escape hatch (2026-08-08): a draft can end up with
// stale clip references baked directly into its saved timeline (e.g.
// from the self-heal race bug that existed before the fix in
// getDraftTimeline above) — fixing the code that CAUSES corruption
// doesn't retroactively repair a timeline that's already corrupted, so
// this gives a reliable way back to a genuinely clean slate regardless
// of how it got dirty.
// Clear (2026-10-17): the draft starts afresh — clips back to Sorted
// media, and the voiceover (its recording deleted), captions, music and
// shape gone.
export async function clearDraftTimeline(siteId: string, renderId: string): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  const imageIds = [...new Set(timeline.clips.map((c) => c.imageId))];

  await db.$transaction([
    db.videoRender.update({
      where: { id: renderId },
      data: { timeline: { clips: [] } },
    }),
    ...(imageIds.length > 0
      ? [
          db.image.updateMany({
            where: { id: { in: imageIds }, status: "BUCKET" },
            data: { status: "SORTED" as const },
          }),
        ]
      : []),
  ]);
  if (timeline.voice) await deleteFromR2(timeline.voice.key).catch(() => {});

  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function reorderTimeline(
  siteId: string,
  renderId: string,
  orderedClipIds: string[]
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);

  const byId = new Map(timeline.clips.map((c) => [c.id, c]));
  const reordered = orderedClipIds
    .map((id) => byId.get(id))
    .filter((c): c is TimelineClip => !!c);
  const missing = timeline.clips.filter((c) => !orderedClipIds.includes(c.id));

  await saveTimeline(renderId, { ...timeline, clips: [...reordered, ...missing] });
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Every photo on screen for the same time (2026-10-16 — the "All photos"
// button by a photo's seconds).
export async function setAllPhotoDurations(siteId: string, renderId: string, duration: number): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft || draft.status !== "DRAFT") return;
  const timeline = readTimeline(draft.timeline);
  const seconds = Math.max(0.1, duration);
  for (const clip of timeline.clips) if (clip.kind === "PHOTO") clip.duration = seconds;
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function setClipDuration(
  siteId: string,
  renderId: string,
  clipId: string,
  duration: number
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;
  clip.duration = Math.max(0.1, duration);
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function initializeClipDuration(
  siteId: string,
  renderId: string,
  clipId: string,
  sourceDuration: number
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip || clip.sourceDuration != null) return;
  clip.sourceDuration = sourceDuration;
  if (clip.trimIn == null || clip.trimOut == null) {
    clip.trimIn = 0;
    clip.trimOut = sourceDuration;
  }
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function setClipTrim(
  siteId: string,
  renderId: string,
  clipId: string,
  trimIn: number,
  trimOut: number
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const maxOut = clip.sourceDuration ?? Infinity;
  clip.trimIn = Math.max(0, Math.min(trimIn, maxOut));
  clip.trimOut = Math.min(maxOut, Math.max(clip.trimIn + 0.1, trimOut));
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function splitClip(
  siteId: string,
  renderId: string,
  clipId: string,
  cutStart: number,
  cutEnd: number
): Promise<void> {
  await requireRecordAccess(db.videoRender.findUnique({ where: { id: renderId }, select: { artistId: true } }));
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);
  const index = timeline.clips.findIndex((c) => c.id === clipId);
  if (index === -1) return;
  const clip = timeline.clips[index];
  if (clip.kind !== "VIDEO" || clip.trimIn == null || clip.trimOut == null) return;

  const partA: TimelineClip = {
    id: randomUUID(),
    imageId: clip.imageId,
    kind: "VIDEO",
    trimIn: clip.trimIn,
    trimOut: Math.max(clip.trimIn, cutStart),
    sourceDuration: clip.sourceDuration,
    stickers: clip.stickers,
    fade: clip.fade,
  };
  const partB: TimelineClip = {
    id: randomUUID(),
    imageId: clip.imageId,
    kind: "VIDEO",
    trimIn: Math.min(clip.trimOut, cutEnd),
    trimOut: clip.trimOut,
    sourceDuration: clip.sourceDuration,
    stickers: clip.stickers,
    fade: clip.fade,
  };

  const nextClips = [...timeline.clips];
  nextClips.splice(index, 1, partA, partB);

  await saveTimeline(renderId, { ...timeline, clips: nextClips });
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Grab still (2026-10-17): one frame of a video, full size, into the
// artist's Hopper. Taken by the background function
// netlify/functions/grab-video-still-background.mts (ffmpeg), which hands
// it to /api/video-stills; it shows in the Hopper a few seconds later.
export async function grabVideoStill(
  imageId: string,
  atSecond: number
): Promise<{ ok: true } | { error: string }> {
  await requireRecordAccess(db.image.findUnique({ where: { id: imageId }, select: { artistId: true } }));
  const video = await db.image.findUnique({
    where: { id: imageId },
    select: { artistId: true, key: true, kind: true, caption: true },
  });
  if (!video || video.kind !== "VIDEO") return { error: "That video couldn't be found." };
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret) return { error: "Stills can't be taken here (MEDIA_IMPORT_SECRET isn't set)." };
  const at = Math.max(0, Number(atSecond) || 0);
  const job: VideoStillJob = {
    artistId: video.artistId,
    videoKey: video.key,
    atSecond: at,
    caption: `${video.caption || "Video"} — still at ${Math.floor(at / 60)}:${(at % 60).toFixed(1).padStart(4, "0")}`,
  };
  try {
    const res = await fetch(`${APP_URL}/.netlify/functions/grab-video-still-background`, {
      method: "POST",
      headers: { [MEDIA_JOB_SECRET_HEADER]: secret, "content-type": "application/json" },
      body: JSON.stringify(job),
      // A redirect means it never reached the function — don't follow it.
      redirect: "manual",
    });
    if (res.status !== 202 && !res.ok) return { error: "The still couldn't be started — try again." };
  } catch {
    return { error: "The still couldn't be started — try again." };
  }
  return { ok: true };
}
