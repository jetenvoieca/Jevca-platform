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
};

export type Timeline = {
  clips: TimelineClip[];
};

export const emptyTimeline: Timeline = { clips: [] };

// Every adjacent pair of clips now crossfades automatically at render
// time (2026-08-07) — this is Shotstack's own fixed fade duration for
// their basic "fade" transition (confirmed directly in their docs: it's
// not an adjustable parameter, always exactly 1 second), so the overlap
// between clips has to match this exactly for the fade to land cleanly.
// Shared between the render logic (which builds the actual overlap) and
// the editor's displayed total-duration estimate (which needs to shorten
// its number by the same amount, or it'd overstate the real result).
export const CROSSFADE_SECONDS = 1;

// Shared with both the client (the live draft's own running total in
// VideoEditorView's header) and the server (getRenderStatus, computing
// the same number for a *completed* render's timeline, once the draft
// itself has moved on to a fresh empty one — see 2026-08-18 fix, header
// showing "0 clips" for a render that clearly had clips).
export function clipLength(c: TimelineClip): number {
  return c.kind === "PHOTO" ? c.duration ?? 2 : Math.max(0, (c.trimOut ?? 0) - (c.trimIn ?? 0));
}

export function totalTimelineSeconds(clips: TimelineClip[]): number {
  return clips.reduce((sum, c, i) => {
    const length = clipLength(c);
    const isLast = i === clips.length - 1;
    const overlap = isLast ? 0 : Math.min(CROSSFADE_SECONDS, length, clipLength(clips[i + 1]));
    return sum + length - overlap;
  }, 0);
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

