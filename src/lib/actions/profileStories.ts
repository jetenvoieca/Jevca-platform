"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";

// The Profile Catalogue (2026-10-26) — see ProfileStory in schema.prisma.

export type ProfileStoryRow = {
  id: string;
  caption: string;
  story: string;
  // Its picture or video — null if it has none (deleted from the Media
  // Catalogue). thumbUrl: a small picture for the grid (a video's still);
  // fullUrl: the picture or video itself.
  media: { imageId: string; kind: "PHOTO" | "VIDEO"; thumbUrl: string | null; displayUrl: string | null; fullUrl: string } | null;
};

type Result<T> = T | { error: string };

const STORY_SELECT = {
  id: true,
  caption: true,
  story: true,
  image: {
    select: { id: true, kind: true, url: true, posterUrl: true, thumbnailKey: true, displayKey: true },
  },
} as const;

type StoryRecord = {
  id: string;
  caption: string;
  story: string;
  image: {
    id: string;
    kind: "PHOTO" | "VIDEO";
    url: string;
    posterUrl: string | null;
    thumbnailKey: string | null;
    displayKey: string | null;
  } | null;
};

function toRow(s: StoryRecord): ProfileStoryRow {
  const img = s.image;
  return {
    id: s.id,
    caption: s.caption,
    story: s.story,
    media: img
      ? {
          imageId: img.id,
          kind: img.kind,
          thumbUrl: img.kind === "VIDEO" ? img.posterUrl : publicMediaUrl(img.thumbnailKey) || img.url,
          displayUrl: img.kind === "VIDEO" ? img.posterUrl : publicMediaUrl(img.displayKey) || img.url,
          fullUrl: img.url,
        }
      : null,
  };
}

export async function listProfileStories(artistId: string): Promise<ProfileStoryRow[]> {
  await requireArtistAccess(artistId);
  const rows = await db.profileStory.findMany({
    where: { artistId },
    orderBy: { position: "asc" },
    select: STORY_SELECT,
  });
  return rows.map(toRow);
}

// A new story at the end of the catalogue, for this picture or video. Its
// caption starts as the picture's own caption (editable).
export async function createProfileStory(artistId: string, imageId: string): Promise<Result<ProfileStoryRow>> {
  await requireArtistAccess(artistId);
  const image = await db.image.findFirst({
    where: { id: imageId, artistId },
    select: { caption: true },
  });
  if (!image) return { error: "That picture or video wasn't found." };
  const last = await db.profileStory.findFirst({
    where: { artistId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const created = await db.profileStory.create({
    data: { artistId, imageId, caption: image.caption ?? "", position: (last?.position ?? -1) + 1 },
    select: STORY_SELECT,
  });
  return toRow(created);
}

export async function updateProfileStory(
  id: string,
  artistId: string,
  fields: { caption?: string; story?: string }
): Promise<Result<ProfileStoryRow>> {
  await requireArtistAccess(artistId);
  const { count } = await db.profileStory.updateMany({
    where: { id, artistId },
    data: {
      ...(fields.caption !== undefined ? { caption: fields.caption.trim() } : {}),
      ...(fields.story !== undefined ? { story: fields.story.trim() } : {}),
    },
  });
  if (count === 0) return { error: "Story not found." };
  const row = await db.profileStory.findUniqueOrThrow({ where: { id }, select: STORY_SELECT });
  return toRow(row);
}

// Deletes the story only — its picture or video stays in the Media
// Catalogue.
export async function deleteProfileStory(id: string, artistId: string): Promise<void> {
  await requireArtistAccess(artistId);
  await db.profileStory.deleteMany({ where: { id, artistId } });
}

// The catalogue in this order (every story's id, first first).
export async function reorderProfileStories(artistId: string, ids: string[]): Promise<Result<{ ok: true }>> {
  await requireArtistAccess(artistId);
  const owned = await db.profileStory.findMany({ where: { artistId }, select: { id: true } });
  const ownedIds = new Set(owned.map((s) => s.id));
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    return { error: "The catalogue changed — reload and try again." };
  }
  await db.$transaction(ids.map((id, position) => db.profileStory.update({ where: { id }, data: { position } })));
  return { ok: true };
}
