"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { readTimeline, type Timeline, type TimelineClip } from "@/lib/videoTimeline";

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
      : { id: randomUUID(), imageId, kind: "VIDEO" };

  timeline.clips.push(clip);
  await saveTimeline(draft.id, timeline);

  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/bucket`);
}

export async function addMediaToBucket(imageId: string, siteId: string): Promise<void> {
  const image = await db.image.findUnique({ where: { id: imageId }, select: { artistId: true } });
  if (!image) return;
  await appendImageToTimeline(image.artistId, siteId, imageId);
  revalidatePath(`/sites/${siteId}/media`);
}

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
  const missing = timeline.clips.filter((c) => !orderedClipIds.includes(c.id));

  await saveTimeline(renderId, { clips: [...reordered, ...missing] });
  revalidatePath(`/sites/${siteId}/bucket`);
}

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
