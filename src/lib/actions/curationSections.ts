"use server";

import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import {
  MAX_SECTION_HEADING,
  MAX_SECTION_IMAGES,
  MAX_SECTION_TEXT,
  SECTION_HEIGHT_LIMITS,
  isCurationSectionType,
  isTextSection,
  type CurationSectionData,
  type SectionMedia,
} from "@/lib/curationSections";

// A curation's presentation sections (2026-10-06) — see CurationSection
// in schema.prisma and lib/curationSections.ts. Every action takes the
// artistId and only touches sections of that artist's own curations,
// and only that artist's own images and videos can be used.

type Result<T> = T | { error: string };

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const SECTION_SELECT = {
  id: true,
  type: true,
  heading: true,
  text: true,
  height: true,
  backgroundColor: true,
  media: {
    orderBy: { position: "asc" },
    select: {
      image: { select: { id: true, kind: true, url: true, displayKey: true, posterUrl: true } },
    },
  },
} as const;

type SectionRow = {
  id: string;
  type: string;
  heading: string | null;
  text: string | null;
  height: number | null;
  backgroundColor: string | null;
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
    type: isCurationSectionType(row.type) ? row.type : "TEXT",
    heading: row.heading,
    text: row.text,
    height: row.height,
    backgroundColor: row.backgroundColor,
    media: row.media.map((m) => toMedia(m.image)),
  };
}

async function ownsCuration(curationId: string, artistId: string): Promise<boolean> {
  const row = await db.curation.findFirst({
    where: { id: curationId, artistId },
    select: { id: true },
  });
  return Boolean(row);
}

// In order, first first.
export async function listCurationSections(
  curationId: string,
  artistId: string
): Promise<CurationSectionData[]> {
  const rows = await db.curationSection.findMany({
    where: { curationId, curation: { artistId } },
    orderBy: { position: "asc" },
    select: SECTION_SELECT,
  });
  return rows.map(toData);
}

// Adds an empty section of `type` at the end.
export async function addCurationSection(
  curationId: string,
  artistId: string,
  type: string
): Promise<Result<CurationSectionData>> {
  if (!isCurationSectionType(type)) return { error: "Unknown section type." };
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  const last = await db.curationSection.findFirst({
    where: { curationId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const row = await db.curationSection.create({
    data: { curationId, type, position: (last?.position ?? -1) + 1 },
    select: SECTION_SELECT,
  });
  return toData(row);
}

// Saves a section's heading and/or text. Blank is stored as nothing.
export async function updateCurationSectionText(
  sectionId: string,
  artistId: string,
  input: { heading?: string; text?: string }
): Promise<Result<{ heading: string | null; text: string | null }>> {
  const data: { heading?: string | null; text?: string | null } = {};
  if (input.heading !== undefined) {
    const heading = input.heading.trim() || null;
    if (heading && heading.length > MAX_SECTION_HEADING) {
      return { error: `A heading can be at most ${MAX_SECTION_HEADING} characters.` };
    }
    data.heading = heading;
  }
  if (input.text !== undefined) {
    const text = input.text.trim() || null;
    if (text && text.length > MAX_SECTION_TEXT) {
      return {
        error: `A section can be at most ${MAX_SECTION_TEXT.toLocaleString("en-GB")} characters.`,
      };
    }
    data.text = text;
  }
  const section = await db.curationSection.findFirst({
    where: { id: sectionId, curation: { artistId } },
    select: { id: true },
  });
  if (!section) return { error: "Section not found." };
  const saved = await db.curationSection.update({
    where: { id: sectionId },
    data,
    select: { heading: true, text: true },
  });
  return saved;
}

// Saves a text section's height (pixels, kept within limits; null =
// just fits its text) and/or background colour (#rrggbb; null = none).
export async function updateCurationSectionStyle(
  sectionId: string,
  artistId: string,
  input: { height?: number | null; backgroundColor?: string | null }
): Promise<Result<{ height: number | null; backgroundColor: string | null }>> {
  const section = await db.curationSection.findFirst({
    where: { id: sectionId, curation: { artistId } },
    select: { id: true, type: true },
  });
  if (!section) return { error: "Section not found." };
  if (!isCurationSectionType(section.type) || !isTextSection(section.type)) {
    return { error: "Only text sections have a height and background colour." };
  }

  const data: { height?: number | null; backgroundColor?: string | null } = {};
  if (input.height !== undefined) {
    data.height =
      input.height === null || !Number.isFinite(input.height)
        ? null
        : Math.round(
            Math.min(SECTION_HEIGHT_LIMITS.max, Math.max(SECTION_HEIGHT_LIMITS.min, input.height))
          );
  }
  if (input.backgroundColor !== undefined) {
    if (input.backgroundColor !== null && !HEX_COLOUR.test(input.backgroundColor)) {
      return { error: "That isn't a colour." };
    }
    data.backgroundColor = input.backgroundColor;
  }

  return db.curationSection.update({
    where: { id: sectionId },
    data,
    select: { height: true, backgroundColor: true },
  });
}

// Sets a Video section's video (one, or none) or an Images section's
// photos (in order), replacing what was there.
export async function setCurationSectionMedia(
  sectionId: string,
  artistId: string,
  imageIds: string[]
): Promise<Result<{ media: SectionMedia[] }>> {
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
  if (!isVideo && ids.length > MAX_SECTION_IMAGES) {
    return { error: `An Images section can hold at most ${MAX_SECTION_IMAGES} images.` };
  }

  const images = await db.image.findMany({
    where: { id: { in: ids }, artistId, kind: isVideo ? "VIDEO" : "PHOTO" },
    select: { id: true, kind: true, url: true, displayKey: true, posterUrl: true },
  });
  if (images.length !== ids.length) {
    return { error: isVideo ? "That video couldn't be found." : "An image couldn't be found." };
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

export async function deleteCurationSection(sectionId: string, artistId: string): Promise<void> {
  await db.curationSection.deleteMany({ where: { id: sectionId, curation: { artistId } } });
}

// Saves a new order: `sectionIds` is every section of the curation, in
// its new order.
export async function reorderCurationSections(
  curationId: string,
  artistId: string,
  sectionIds: string[]
): Promise<Result<{ ok: true }>> {
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  await db.$transaction(
    sectionIds.map((id, position) =>
      db.curationSection.updateMany({ where: { id, curationId }, data: { position } })
    )
  );
  return { ok: true };
}
