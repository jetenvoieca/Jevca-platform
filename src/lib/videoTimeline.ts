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

// A voiceover (2026-10-17): recorded in the browser or uploaded, saved in
// R2 at `key` (under {artistId}/voice/), playing from `start` seconds into
// the video. While it plays the music drops to `musicUnderVoice` of its
// volume (0–1).
// How far the music drops under a new voiceover, to start with.
export const DEFAULT_MUSIC_UNDER_VOICE = 0.3;

export type TimelineVoice = {
  key: string;
  durationSeconds: number;
  start: number;
  musicUnderVoice: number;
};

// Captions — words on screen (2026-10-17): either made at render time
// from the voiceover (Shotstack listens to it and times each word), or
// typed lines, each shown from `start` to `end` seconds. In one of a few
// looks, at the top, middle or bottom of the video.
export type CaptionMode = "voice" | "typed";
export type CaptionStyle = "clean" | "highlight" | "karaoke" | "pop" | "typewriter";
export type CaptionPosition = "top" | "center" | "bottom";
export type CaptionLine = { id: string; text: string; start: number; end: number };

export type TimelineCaptions = {
  mode: CaptionMode;
  style: CaptionStyle;
  position: CaptionPosition;
  lines: CaptionLine[];
};

export const CAPTION_STYLES: { value: CaptionStyle; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "highlight", label: "Highlight word" },
  { value: "karaoke", label: "Karaoke" },
  { value: "pop", label: "Pop" },
  { value: "typewriter", label: "Typewriter" },
];

export const CAPTION_POSITIONS: { value: CaptionPosition; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "center", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

export type Timeline = {
  clips: TimelineClip[];
  shape?: VideoShape;
  music?: TimelineMusic;
  muteClips?: boolean;
  fade?: FadeSpeed;
  voice?: TimelineVoice;
  captions?: TimelineCaptions;
};

// The music's volume through the video (2026-10-17), as Shotstack volume
// changes ({from, to, start, length}, back to back): fading in over the
// first second, dipping under the voiceover (half a second down, half a
// second back up), and fading out over the last second. The render uses
// these as they are; the preview reads them with volumeAt.
export type VolumeChange = { from: number; to: number; start: number; length: number };

const MUSIC_FADE_SECONDS = 1;
const DUCK_SECONDS = 0.5;

export function musicVolumeChanges(
  volume: number,
  totalSeconds: number,
  voice: { start: number; end: number; level: number } | null
): VolumeChange[] {
  // Points in time and the volume there, joined by straight changes.
  const fade = Math.min(MUSIC_FADE_SECONDS, totalSeconds / 2);
  const points: [number, number][] = [[0, 0], [fade, volume]];
  if (voice && voice.end > voice.start) {
    const low = volume * voice.level;
    const downAt = Math.max(fade, voice.start - DUCK_SECONDS);
    const upEnd = Math.min(totalSeconds - fade, voice.end + DUCK_SECONDS);
    if (upEnd > downAt) {
      points.push([downAt, volume], [Math.min(voice.start, upEnd), low], [Math.max(downAt, voice.end), low], [upEnd, volume]);
    }
  }
  points.push([totalSeconds - fade, volume], [totalSeconds, 0]);
  const changes: VolumeChange[] = [];
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t1 > t0) changes.push({ from: v0, to: v1, start: t0, length: t1 - t0 });
  }
  return changes;
}

export function volumeAt(changes: VolumeChange[], t: number): number {
  for (const c of changes) {
    if (t >= c.start && t < c.start + c.length) return c.from + ((c.to - c.from) * (t - c.start)) / c.length;
  }
  return 0;
}

export const emptyTimeline: Timeline = { clips: [] };

// How clips change from one to the next (2026-10-16; always a 1-second
// fade before): a cut, or a fade of 0.5 to 4 seconds. Neighbouring clips
// overlap by the fade's length (never more than either clip's own
// length), the next one fading in over the one before; the render, the
// preview and the running total all use the same overlaps (clipStarts,
// totalTimelineSeconds).
export type FadeSpeed = "none" | "fast" | "normal" | "slow" | "slower" | "slowest";

export const FADE_SPEEDS: { value: FadeSpeed; label: string; seconds: number }[] = [
  { value: "none", label: "Cut", seconds: 0 },
  { value: "fast", label: "½s", seconds: 0.5 },
  { value: "normal", label: "1s", seconds: 1 },
  { value: "slow", label: "2s", seconds: 2 },
  { value: "slower", label: "3s", seconds: 3 },
  { value: "slowest", label: "4s", seconds: 4 },
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

// How long each clip takes to fade in over the one before (0 for the first).
export function clipFadeIns(clips: TimelineClip[], fadeSeconds: number): number[] {
  return clips.map((_, i) => (i === 0 ? 0 : overlapAfter(clips, i - 1, fadeSeconds)));
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

