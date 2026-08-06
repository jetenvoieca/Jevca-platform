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
