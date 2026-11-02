"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";

// The Profile Catalogue (2026-10-26) — see ProfileStory in schema.prisma.

export type ProfileStoryKind = "STORY" | "STATEMENT" | "BIOGRAPHY";

// The entries every artist has (2026-11-02), first in the catalogue, in
// this order, named by their kind.
const FIXED_ENTRIES: { kind: Exclude<ProfileStoryKind, "STORY">; caption: string }[] = [
  { kind: "STATEMENT", caption: "Artist Statement" },
  { kind: "BIOGRAPHY", caption: "Biography / CV" },
];

export type ProfileStoryRow = {
  id: string;
  kind: ProfileStoryKind;
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
  kind: true,
  caption: true,
  story: true,
  image: {
    select: { id: true, kind: true, url: true, posterUrl: true, thumbnailKey: true, displayKey: true },
  },
} as const;

type StoryRecord = {
  id: string;
  kind: ProfileStoryKind;
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
  const fixed = FIXED_ENTRIES.find((f) => f.kind === s.kind);
  return {
    id: s.id,
    kind: s.kind,
    caption: fixed ? fixed.caption : s.caption,
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

// The whole catalogue: the Artist Statement and Biography / CV first
// (made here the first time, empty), then the stories in order.
export async function listProfileCatalogue(artistId: string): Promise<ProfileStoryRow[]> {
  await requireArtistAccess(artistId);
  const have = await db.profileStory.findMany({
    where: { artistId, kind: { not: "STORY" } },
    select: { kind: true },
  });
  const missing = FIXED_ENTRIES.filter((f) => !have.some((h) => h.kind === f.kind));
  if (missing.length) {
    await db.profileStory.createMany({
      data: missing.map((f) => ({ artistId, kind: f.kind, caption: f.caption, position: 0 })),
    });
  }
  const rows = await db.profileStory.findMany({
    where: { artistId },
    orderBy: { position: "asc" },
    select: STORY_SELECT,
  });
  const rank = (kind: ProfileStoryKind) => {
    const i = FIXED_ENTRIES.findIndex((f) => f.kind === kind);
    return i < 0 ? FIXED_ENTRIES.length : i;
  };
  return rows.map(toRow).sort((a, b) => rank(a.kind) - rank(b.kind));
}

// The stories a page's Profile stories can show — the stories only, in
// order (the Artist Statement and Biography / CV aren't offered yet).
export async function listProfileStories(artistId: string): Promise<ProfileStoryRow[]> {
  await requireArtistAccess(artistId);
  const rows = await db.profileStory.findMany({
    where: { artistId, kind: "STORY" },
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
    where: { artistId, kind: "STORY" },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const created = await db.profileStory.create({
    data: { artistId, imageId, caption: image.caption ?? "", position: (last?.position ?? -1) + 1 },
    select: STORY_SELECT,
  });
  return toRow(created);
}

// The Artist Statement's and Biography / CV's names are fixed — a
// caption sent for them is ignored.
export async function updateProfileStory(
  id: string,
  artistId: string,
  fields: { caption?: string; story?: string }
): Promise<Result<ProfileStoryRow>> {
  await requireArtistAccess(artistId);
  const entry = await db.profileStory.findFirst({ where: { id, artistId }, select: { kind: true } });
  if (!entry) return { error: "Story not found." };
  const { count } = await db.profileStory.updateMany({
    where: { id, artistId },
    data: {
      ...(fields.caption !== undefined && entry.kind === "STORY" ? { caption: fields.caption.trim() } : {}),
      ...(fields.story !== undefined ? { story: fields.story.trim() } : {}),
    },
  });
  if (count === 0) return { error: "Story not found." };
  const row = await db.profileStory.findUniqueOrThrow({ where: { id }, select: STORY_SELECT });
  return toRow(row);
}

// Gives a story another picture or video from the Media Catalogue
// (2026-10-27) — e.g. once its own was deleted there.
export async function setProfileStoryImage(
  id: string,
  artistId: string,
  imageId: string
): Promise<Result<ProfileStoryRow>> {
  await requireArtistAccess(artistId);
  const image = await db.image.findFirst({ where: { id: imageId, artistId }, select: { id: true } });
  if (!image) return { error: "That picture or video wasn't found." };
  const { count } = await db.profileStory.updateMany({ where: { id, artistId }, data: { imageId } });
  if (count === 0) return { error: "Story not found." };
  const row = await db.profileStory.findUniqueOrThrow({ where: { id }, select: STORY_SELECT });
  return toRow(row);
}

// Deletes the story only — its picture or video stays in the Media
// Catalogue. The Artist Statement and Biography / CV can't be deleted.
export async function deleteProfileStory(id: string, artistId: string): Promise<void> {
  await requireArtistAccess(artistId);
  await db.profileStory.deleteMany({ where: { id, artistId, kind: "STORY" } });
}

// The stories in this order (every story's id, first first — the Artist
// Statement and Biography / CV stay first and aren't included).
export async function reorderProfileStories(artistId: string, ids: string[]): Promise<Result<{ ok: true }>> {
  await requireArtistAccess(artistId);
  const owned = await db.profileStory.findMany({ where: { artistId, kind: "STORY" }, select: { id: true } });
  const ownedIds = new Set(owned.map((s) => s.id));
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
    return { error: "The catalogue changed — reload and try again." };
  }
  await db.$transaction(ids.map((id, position) => db.profileStory.update({ where: { id }, data: { position } })));
  return { ok: true };
}
