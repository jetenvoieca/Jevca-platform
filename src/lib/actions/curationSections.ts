"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import {
  MAX_SUPPORTING_MEDIA,
  MAX_SECTION_TEXT,
  type CurationSectionData,
  type SectionMedia,
} from "@/lib/curationSections";

// A curation's presentation sections (2026-10-06) — see CurationSection
// in schema.prisma and lib/curationSections.ts. Every curation has the
// same three, made with it (createCuration), so there's nothing to add,
// delete or reorder (2026-10-13). Every action takes the artistId and
// only touches sections of that artist's own curations, and only that
// artist's own images and videos can be used.

type Result<T> = T | { error: string };

const SECTION_SELECT = {
  id: true,
  type: true,
  text: true,
  media: {
    orderBy: { position: "asc" },
    select: {
      image: { select: { id: true, kind: true, url: true, displayKey: true, posterUrl: true } },
    },
  },
} as const;

type SectionRow = {
  id: string;
  type: CurationSectionData["type"];
  text: string | null;
  media: {
    image: {
      id: string;
      kind: "PHOTO" | "VIDEO";
      url: string;
      displayKey: string | null;
      posterUrl: string | null;
    };
  }[];
};

function toMedia(image: SectionRow["media"][number]["image"]): SectionMedia {
  return {
    imageId: image.id,
    kind: image.kind,
    url: image.kind === "PHOTO" ? publicMediaUrl(image.displayKey) || image.url : image.url,
    posterUrl: image.posterUrl,
  };
}

function toData(row: SectionRow): CurationSectionData {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    media: row.media.map((m) => toMedia(m.image)),
  };
}

// The curation's three sections, in their fixed order (the type's order).
export async function listCurationSections(curationId: string, artistId: string): Promise<CurationSectionData[]> {
  await requireArtistAccess(artistId);
  const rows = await db.curationSection.findMany({
    where: { curationId, curation: { artistId } },
    orderBy: { type: "asc" },
    select: SECTION_SELECT,
  });
  return rows.map(toData);
}

// Saves the Description's text. Blank is stored as nothing.
export async function updateCurationSectionText(
  sectionId: string,
  artistId: string,
  textRaw: string,
): Promise<Result<{ text: string | null }>> {
  await requireArtistAccess(artistId);
  const text = textRaw.trim() || null;
  if (text && text.length > MAX_SECTION_TEXT) {
    return {
      error: `A description can be at most ${MAX_SECTION_TEXT.toLocaleString("en-GB")} characters.`,
    };
  }
  const section = await db.curationSection.findFirst({
    where: { id: sectionId, curation: { artistId }, type: "DESCRIPTION" },
    select: { id: true },
  });
  if (!section) return { error: "Section not found." };
  return db.curationSection.update({
    where: { id: sectionId },
    data: { text },
    select: { text: true },
  });
}

// Sets the Video section's video (one, or none) or the Supporting
// Media section's pictures and videos (in order; videos since
// 2026-10-25), replacing what was there.
export async function setCurationSectionMedia(
  sectionId: string,
  artistId: string,
  imageIds: string[],
): Promise<Result<{ media: SectionMedia[] }>> {
  await requireArtistAccess(artistId);
  const section = await db.curationSection.findFirst({
    where: { id: sectionId, curation: { artistId } },
    select: { id: true, type: true },
  });
  if (!section) return { error: "Section not found." };
  if (section.type !== "VIDEO" && section.type !== "IMAGES") {
    return { error: "This section can't hold images or video." };
  }

  const ids = [...new Set(imageIds)];
  const isVideo = section.type === "VIDEO";
  if (isVideo && ids.length > 1) return { error: "A Video section holds one video." };
  if (!isVideo && ids.length > MAX_SUPPORTING_MEDIA) {
    return { error: `Supporting Media can hold at most ${MAX_SUPPORTING_MEDIA} pictures and videos.` };
  }

  const images = await db.image.findMany({
    where: { id: { in: ids }, artistId, ...(isVideo ? { kind: "VIDEO" as const } : {}) },
    select: { id: true, kind: true, url: true, displayKey: true, posterUrl: true },
  });
  if (images.length !== ids.length) {
    return { error: isVideo ? "That video couldn't be found." : "A picture or video couldn't be found." };
  }

  await db.$transaction([
    db.curationSectionMedia.deleteMany({ where: { sectionId } }),
    db.curationSectionMedia.createMany({
      data: ids.map((imageId, position) => ({ sectionId, imageId, position })),
    }),
  ]);

  const byId = new Map(images.map((img) => [img.id, img]));
  return { media: ids.map((id) => toMedia(byId.get(id)!)) };
}
