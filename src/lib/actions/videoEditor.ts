"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { readTimeline, type Timeline, type TimelineClip } from "@/lib/videoTimeline";

// One active DRAFT VideoRender per artist represents "the video currently
// being put together in the Video Editor" — enforced in application code
// only (find-before-create), not a DB constraint. Same 80/20 pattern
// already used for "only one ACTIVE Purchase per artwork" elsewhere in
// this project (see decisions-log.md).
async function getOrCreateDraft(artistId: string) {
  const existing = await db.videoRender.findFirst({
    where: { artistId, status: "DRAFT" },
  });
  if (existing) return existing;
  return db.videoRender.create({
    data: { artistId, status: "DRAFT", timeline: { clips: [] } },
  });
}

async function saveTimeline(renderId: string, timeline: Timeline): Promise<void> {
  await db.videoRender.update({ where: { id: renderId }, data: { timeline } });
}

// The draft's timeline with each clip's Image data joined in — what the
// Video Editor screen actually renders.
//
// Also self-heals a real gap: any Image already sitting at status BUCKET
// that isn't yet referenced by any clip in the current draft — e.g. one
// added via the Hopper before this timeline system existed, back when
// "Add to Bucket" only set the status flag — gets folded into the draft
// here. Without this, such an item is invisible in the strip forever
// while still counting toward the Bucket nav badge, which is exactly
// the mismatch (badge showing more than the strip shows) this fixes.
export async function getDraftTimeline(artistId: string) {
  const draft = await getOrCreateDraft(artistId);
  let timeline = readTimeline(draft.timeline);

  const referencedIds = new Set(timeline.clips.map((c) => c.imageId));
  const orphaned = await db.image.findMany({
    where: { artistId, status: "BUCKET", id: { notIn: [...referencedIds] } },
    select: { id: true, kind: true },
    orderBy: { createdAt: "asc" },
  });
  if (orphaned.length > 0) {
    const healedClips: TimelineClip[] = orphaned.map((img) =>
      img.kind === "PHOTO"
        ? { id: randomUUID(), imageId: img.id, kind: "PHOTO", duration: 2 }
        : { id: randomUUID(), imageId: img.id, kind: "VIDEO" }
    );
    timeline = { clips: [...timeline.clips, ...healedClips] };
    await saveTimeline(draft.id, timeline);
  }

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

  return { renderId: draft.id, clips };
}

// Adds an item to the Bucket AND to the draft timeline in one go — called
// from the Hopper's "Add to Bucket" button via hopper.ts's
// addHopperItemToBucket.
export async function appendImageToTimeline(
  artistId: string,
  siteId: string,
  imageId: string
): Promise<void> {
  const image = await db.image.findUnique({ where: { id: imageId }, select: { kind: true } });
  if (!image) return;

  await db.image.update({ where: { id: imageId }, data: { status: "BUCKET" } });

  const draft = await getOrCreateDraft(artistId);
  const timeline = readTimeline(draft.timeline);

  const clip: TimelineClip =
    image.kind === "PHOTO"
      ? { id: randomUUID(), imageId, kind: "PHOTO", duration: 2 }
      : { id: randomUUID(), imageId, kind: "VIDEO" }; // trim/sourceDuration set once the browser loads its metadata

  timeline.clips.push(clip);
  await saveTimeline(draft.id, timeline);

  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Removes a specific clip from the strip. If no other clip in the
// timeline still references the same Image (i.e. this wasn't one half of
// a split clip), the Image goes back to ordinary Sorted media — nothing
// archived, per bucket-video-editor-design.md.
export async function removeClipFromTimeline(
  siteId: string,
  renderId: string,
  clipId: string
): Promise<void> {
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

// Coarser version of the above for when you only have an Image id, not a
// specific clip id — removes every clip referencing that Image and
// returns it to Sorted. Used by the plain Bucket grid's "Remove" button
// during the transition; kept for robustness even now the real strip is
// the primary screen.
export async function removeImageFromBucketEntirely(
  artistId: string,
  siteId: string,
  imageId: string
): Promise<void> {
  const draft = await db.videoRender.findFirst({ where: { artistId, status: "DRAFT" } });
  if (draft) {
    const timeline = readTimeline(draft.timeline);
    const nextClips = timeline.clips.filter((c) => c.imageId !== imageId);
    if (nextClips.length !== timeline.clips.length) {
      await saveTimeline(draft.id, { clips: nextClips });
    }
  }
  await db.image.update({ where: { id: imageId }, data: { status: "SORTED" } });
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Persists a new strip order after a drag-and-drop reorder.
export async function reorderTimeline(
  siteId: string,
  renderId: string,
  orderedClipIds: string[]
): Promise<void> {
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);

  const byId = new Map(timeline.clips.map((c) => [c.id, c]));
  const reordered = orderedClipIds
    .map((id) => byId.get(id))
    .filter((c): c is TimelineClip => !!c);
  // Safety net: if the id list somehow doesn't cover every clip, keep
  // whatever's missing at the end rather than silently losing it.
  const missing = timeline.clips.filter((c) => !orderedClipIds.includes(c.id));

  await saveTimeline(renderId, { clips: [...reordered, ...missing] });
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Sets a photo's on-screen duration, in seconds.
export async function setClipDuration(
  siteId: string,
  renderId: string,
  clipId: string,
  duration: number
): Promise<void> {
  const draft = await db.videoRender.findUnique({ where: { id: renderId } });
  if (!draft) return;
  const timeline = readTimeline(draft.timeline);
  const clip = timeline.clips.find((c) => c.id === clipId);
  if (!clip) return;
  clip.duration = Math.max(0.1, duration);
  await saveTimeline(renderId, timeline);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Records the source video's real duration the first time the browser
// loads its metadata, and — only if not already known — seeds
// trimIn=0/trimOut=full length as the starting default. Safe to call
// repeatedly; a no-op once sourceDuration is already recorded.
export async function initializeClipDuration(
  siteId: string,
  renderId: string,
  clipId: string,
  sourceDuration: number
): Promise<void> {
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

// Sets a video clip's trim in/out points, in seconds. Clamped against
// sourceDuration when known, so trim can never exceed the real source.
export async function setClipTrim(
  siteId: string,
  renderId: string,
  clipId: string,
  trimIn: number,
  trimOut: number
): Promise<void> {
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

// Mid-clip cut: marks [cutStart, cutEnd] within a video clip's current
// trim range for removal, splitting it into two adjacent clips — Part A
// (original trimIn → cutStart) and Part B (cutEnd → original trimOut) —
// in place of the original, both pointing at the same source Image and
// carrying the same sourceDuration so each can still be trimmed further
// independently. See bucket-video-editor-design.md, §4.
export async function splitClip(
  siteId: string,
  renderId: string,
  clipId: string,
  cutStart: number,
  cutEnd: number
): Promise<void> {
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
  };
  const partB: TimelineClip = {
    id: randomUUID(),
    imageId: clip.imageId,
    kind: "VIDEO",
    trimIn: Math.min(clip.trimOut, cutEnd),
    trimOut: clip.trimOut,
    sourceDuration: clip.sourceDuration,
  };

  const nextClips = [...timeline.clips];
  nextClips.splice(index, 1, partA, partB);

  await saveTimeline(renderId, { clips: nextClips });
  revalidatePath(`/sites/${siteId}/bucket`);
}
