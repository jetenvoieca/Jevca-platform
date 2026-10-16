import type { ClipSticker } from "@/lib/stickers";

// Shared shape for a VideoRender's `timeline` JSON field — the ordered
// list of clips making up the video currently being put together in the
// Bucket/Video Editor. See bucket-video-editor-design.md.
//
// A clip's `id` is deliberately NOT the same as its `imageId`: a mid-clip
// cut splits one source video into two clips that both point at the same
// Image with different trim ranges, so one Image can appear as more than
// one clip in the strip.

export type TimelineClip = {
  id: string;
  imageId: string;
  kind: "PHOTO" | "VIDEO";
  // Photos only. Seconds on screen. Defaults to 2 when first added.
  duration?: number;
  // Video only. Seconds into the source file — the current trim points.
  trimIn?: number;
  trimOut?: number;
  // Video only. The source file's TRUE full duration, captured once from
  // the browser and never changed afterwards — independent of
  // trimIn/trimOut, which move as you trim. Without this, once a clip is
  // trimmed down there'd be no way to know how far it could be trimmed
  // back out again, and a mid-clip cut wouldn't know the real bounds for
  // either resulting half.
  sourceDuration?: number;
  // Picture stickers shown for the whole of this clip (2026-10-16).
  stickers?: ClipSticker[];
};

// The video's shape (2026-10-16): upright 9:16 for Reels and Stories,
// portrait 4:5 or square for the feed. Videos made before this are
// square.
export type VideoShape = "upright" | "portrait" | "square";

export const VIDEO_SHAPES: { value: VideoShape; label: string; width: number; height: number }[] = [
  { value: "upright", label: "Upright 9:16", width: 1080, height: 1920 },
  { value: "portrait", label: "Portrait 4:5", width: 1080, height: 1350 },
  { value: "square", label: "Square", width: 1080, height: 1080 },
];

export function videoSize(shape: VideoShape | undefined): { width: number; height: number } {
  const found = VIDEO_SHAPES.find((s) => s.value === shape) ?? VIDEO_SHAPES[2];
  return { width: found.width, height: found.height };
}

export function isVideoShape(value: unknown): value is VideoShape {
  return VIDEO_SHAPES.some((s) => s.value === value);
}

// Music under the whole video (2026-10-16): a track from the artist's
// Music library, fading in and out, at `volume` (0–1). `muteClips`
// silences the clips' own sound.
export type TimelineMusic = { trackId: string; volume: number };

export type Timeline = {
  clips: TimelineClip[];
  shape?: VideoShape;
  music?: TimelineMusic;
  muteClips?: boolean;
  fade?: FadeSpeed;
};

export const emptyTimeline: Timeline = { clips: [] };

// How clips change from one to the next (2026-10-16; always a 1-second
// fade before). Shotstack's fades come in three fixed lengths — fadeFast
// 0.5s, fade 1s, fadeSlow 2s — so those are the choices, or a straight
// cut. Neighbouring clips overlap by the fade's length so one dissolves
// into the next; the render, the preview and the running total all use
// the same overlaps (clipStarts, totalTimelineSeconds).
export type FadeSpeed = "none" | "fast" | "normal" | "slow";

export const FADE_SPEEDS: {
  value: FadeSpeed;
  label: string;
  seconds: number;
  transition: "fadeFast" | "fade" | "fadeSlow" | null;
}[] = [
  { value: "none", label: "Cut", seconds: 0, transition: null },
  { value: "fast", label: "Fast fade", seconds: 0.5, transition: "fadeFast" },
  { value: "normal", label: "Fade", seconds: 1, transition: "fade" },
  { value: "slow", label: "Slow fade", seconds: 2, transition: "fadeSlow" },
];

export function fadeSpeedOf(value: FadeSpeed | undefined) {
  return FADE_SPEEDS.find((f) => f.value === value) ?? FADE_SPEEDS[2];
}

export function isFadeSpeed(value: unknown): value is FadeSpeed {
  return FADE_SPEEDS.some((f) => f.value === value);
}

// Shared with both the client (the live draft's own running total in
// VideoEditorView's header) and the server (getRenderStatus, computing
// the same number for a *completed* render's timeline, once the draft
// itself has moved on to a fresh empty one — see 2026-08-18 fix, header
// showing "0 clips" for a render that clearly had clips).
export function clipLength(c: TimelineClip): number {
  return c.kind === "PHOTO" ? c.duration ?? 2 : Math.max(0, (c.trimOut ?? 0) - (c.trimIn ?? 0));
}

// How much each clip overlaps the next (none for the last).
function overlapAfter(clips: TimelineClip[], i: number, fadeSeconds: number): number {
  return i === clips.length - 1 ? 0 : Math.min(fadeSeconds, clipLength(clips[i]), clipLength(clips[i + 1]));
}

// When each clip starts, in seconds.
export function clipStarts(clips: TimelineClip[], fadeSeconds: number): number[] {
  let cursor = 0;
  return clips.map((clip, i) => {
    const start = cursor;
    cursor += clipLength(clip) - overlapAfter(clips, i, fadeSeconds);
    return start;
  });
}

export function totalTimelineSeconds(clips: TimelineClip[], fadeSeconds: number): number {
  return clips.reduce((sum, c, i) => sum + clipLength(c) - overlapAfter(clips, i, fadeSeconds), 0);
}

export function readTimeline(raw: unknown): Timeline {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as Timeline).clips)
  ) {
    return raw as Timeline;
  }
  return { clips: [] };
}

