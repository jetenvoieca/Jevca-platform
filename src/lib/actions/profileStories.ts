"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { clearProfileEntries, ensureFixedEntries } from "@/lib/profileCatalogue";
import { FIXED_ENTRIES, type FixedKind, type ProfileStoryKind } from "@/lib/profileEntries";

// The Profile Catalogue (2026-10-26) — see ProfileStory in schema.prisma
// and lib/profileEntries.ts (the fixed entries).

// One gallery in a Galleries entry (2026-11-03): its Location's name, and
// its town and website from its Customer record.
export type ProfileGalleryRow = {
  locationId: string;
  name: string;
  town: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
};

export type ProfileStoryRow = {
  id: string;
  kind: ProfileStoryKind;
  caption: string;
  story: string;
  // Its picture or video — null if it has none (deleted from the Media
  // Catalogue). thumbUrl: a small picture for the grid (a video's still);
  // fullUrl: the picture or video itself.
  media: { imageId: string; kind: "PHOTO" | "VIDEO"; thumbUrl: string | null; displayUrl: string | null; fullUrl: string } | null;
  // A Galleries entry's galleries, in order — none for any other entry.
  galleries: ProfileGalleryRow[];
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
  galleries: {
    orderBy: { position: "asc" },
    select: {
      location: {
        select: { id: true, name: true, customer: { select: { town: true, websiteName: true, websiteUrl: true } } },
      },
    },
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
  galleries: {
    location: {
      id: string;
      name: string;
      customer: { town: string | null; websiteName: string | null; websiteUrl: string | null };
    };
  }[];
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
    galleries: s.galleries.map(({ location: l }) => ({
      locationId: l.id,
      name: l.name,
      town: l.customer.town,
      websiteName: l.customer.websiteName,
      websiteUrl: l.customer.websiteUrl,
    })),
  };
}

// The whole catalogue: the fixed entries first (made here the first
// time, empty), then the stories in order.
export async function listProfileCatalogue(artistId: string): Promise<ProfileStoryRow[]> {
  await requireArtistAccess(artistId);
  await ensureFixedEntries(artistId);
  return entriesInOrder(artistId);
}

// What a page's Profile stories can show — every entry, in the
// catalogue's order: since 2026-11-03 (Craig's request, the ISYT profile
// page) the Artist Statement and Biography / CV too, once the artist has
// them (they're made when the Profile Catalogue is first opened).
export async function listProfileStories(artistId: string): Promise<ProfileStoryRow[]> {
  await requireArtistAccess(artistId);
  return entriesInOrder(artistId);
}

// The artist's entries: the fixed ones first, in FIXED_ENTRIES' order,
// then the stories in their order.
async function entriesInOrder(artistId: string): Promise<ProfileStoryRow[]> {
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

// The fixed entries' names are fixed — a caption sent for them is
// ignored.
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

// Sets a Galleries entry's galleries, in this order (2026-11-03): the
// ids of the artist's Locations of type Gallery, first first.
export async function setProfileGalleries(
  id: string,
  artistId: string,
  locationIds: string[]
): Promise<Result<ProfileStoryRow>> {
  await requireArtistAccess(artistId);
  const entry = await db.profileStory.findFirst({
    where: { id, artistId, kind: "GALLERIES" },
    select: { id: true },
  });
  if (!entry) return { error: "The Galleries entry wasn't found." };
  const ids = [...new Set(locationIds)];
  const found = await db.location.count({ where: { id: { in: ids }, artistId, type: "GALLERY" } });
  if (found !== ids.length) return { error: "One of those galleries wasn't found — reload and try again." };
  await db.$transaction([
    db.profileGallery.deleteMany({ where: { storyId: id } }),
    db.profileGallery.createMany({ data: ids.map((locationId, position) => ({ storyId: id, locationId, position })) }),
  ]);
  const row = await db.profileStory.findUniqueOrThrow({ where: { id }, select: STORY_SELECT });
  return toRow(row);
}

// Deletes the story only — its picture or video stays in the Media
// Catalogue. The fixed entries can't be deleted.
export async function deleteProfileStory(id: string, artistId: string): Promise<void> {
  await requireArtistAccess(artistId);
  await db.profileStory.deleteMany({ where: { id, artistId, kind: "STORY" } });
}

// Clear all (2026-11-09) — see clearProfileEntries. Returns the
// catalogue as it now is.
export async function clearProfileCatalogue(
  artistId: string,
  choice: { fixed: FixedKind[]; stories: boolean }
): Promise<Result<ProfileStoryRow[]>> {
  await requireArtistAccess(artistId);
  await clearProfileEntries(artistId, choice);
  return entriesInOrder(artistId);
}

// The stories in this order (every story's id, first first — the fixed
// entries stay first and aren't included).
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
