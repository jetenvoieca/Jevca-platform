"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { ARTWORK_IMAGE_SELECT, toArtworkImage, type ArtworkImage } from "@/lib/artworkImages";

// The Exhibitions catalogue (2026-11-02) — see Exhibition in
// schema.prisma.

// The venue as an exhibition shows it: the Location's name and its
// contact details (from its Customer record).
export type ExhibitionVenue = {
  locationId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
};

export type ExhibitionRow = {
  id: string;
  name: string;
  venue: ExhibitionVenue | null;
  // "YYYY-MM-DD", or null when blank.
  startDate: string | null;
  endDate: string | null;
  openingTimes: string;
  description: string;
  archived: boolean;
  // Main first.
  images: ArtworkImage[];
};

type Result<T> = T | { error: string };

const MAX_EXHIBITION_IMAGES = 4;

const EXHIBITION_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  openingTimes: true,
  description: true,
  archivedAt: true,
  location: {
    select: {
      id: true,
      name: true,
      customer: {
        select: { address: true, phone: true, email: true, websiteName: true, websiteUrl: true },
      },
    },
  },
  images: { orderBy: { position: "asc" }, select: { image: { select: ARTWORK_IMAGE_SELECT } } },
} as const;

type ExhibitionRecord = {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  openingTimes: string;
  description: string;
  archivedAt: Date | null;
  location: {
    id: string;
    name: string;
    customer: {
      address: string | null;
      phone: string | null;
      email: string | null;
      websiteName: string | null;
      websiteUrl: string | null;
    };
  } | null;
  images: { image: Parameters<typeof toArtworkImage>[0] }[];
};

// A date column's day, as "YYYY-MM-DD".
function dayOf(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

// A typed "YYYY-MM-DD" as a date column's day; blank = none. Undefined
// for anything else.
function parseDay(value: string | null): Date | null | undefined {
  if (value === null || value.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toRow(e: ExhibitionRecord): ExhibitionRow {
  const l = e.location;
  return {
    id: e.id,
    name: e.name,
    venue: l
      ? {
          locationId: l.id,
          name: l.name,
          address: l.customer.address,
          phone: l.customer.phone,
          email: l.customer.email,
          websiteName: l.customer.websiteName,
          websiteUrl: l.customer.websiteUrl,
        }
      : null,
    startDate: dayOf(e.startDate),
    endDate: dayOf(e.endDate),
    openingTimes: e.openingTimes,
    description: e.description,
    archived: e.archivedAt !== null,
    images: e.images.map((i) => toArtworkImage(i.image)),
  };
}

async function readRow(id: string): Promise<ExhibitionRow> {
  return toRow(await db.exhibition.findUniqueOrThrow({ where: { id }, select: EXHIBITION_SELECT }));
}

// Every exhibition, archived ones included (the page shows them apart),
// by start date — earliest first, those without one last.
export async function listExhibitions(artistId: string): Promise<ExhibitionRow[]> {
  await requireArtistAccess(artistId);
  const rows = await db.exhibition.findMany({
    where: { artistId },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: EXHIBITION_SELECT,
  });
  return rows.map(toRow);
}

// The exhibitions a site shows (2026-11-02): all but the archived ones,
// in the catalogue's order.
export async function listShownExhibitions(artistId: string): Promise<ExhibitionRow[]> {
  return (await listExhibitions(artistId)).filter((e) => !e.archived);
}

// A new, blank exhibition, to fill in.
export async function createExhibition(artistId: string): Promise<ExhibitionRow> {
  await requireArtistAccess(artistId);
  const created = await db.exhibition.create({ data: { artistId }, select: { id: true } });
  return readRow(created.id);
}

export type ExhibitionFields = {
  name?: string;
  // A Location of this artist's, or null for none.
  locationId?: string | null;
  // "YYYY-MM-DD", or blank / null for none.
  startDate?: string | null;
  endDate?: string | null;
  openingTimes?: string;
  description?: string;
};

export async function updateExhibition(
  id: string,
  artistId: string,
  fields: ExhibitionFields,
): Promise<Result<ExhibitionRow>> {
  await requireArtistAccess(artistId);
  const startDate = fields.startDate !== undefined ? parseDay(fields.startDate) : undefined;
  const endDate = fields.endDate !== undefined ? parseDay(fields.endDate) : undefined;
  if ((fields.startDate !== undefined && startDate === undefined) || (fields.endDate !== undefined && endDate === undefined)) {
    return { error: "That date couldn't be read." };
  }
  if (fields.locationId) {
    const location = await db.location.findFirst({ where: { id: fields.locationId, artistId }, select: { id: true } });
    if (!location) return { error: "That venue wasn't found." };
  }
  const { count } = await db.exhibition.updateMany({
    where: { id, artistId },
    data: {
      ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
      ...(fields.locationId !== undefined ? { locationId: fields.locationId } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(fields.openingTimes !== undefined ? { openingTimes: fields.openingTimes.trim() } : {}),
      ...(fields.description !== undefined ? { description: fields.description.trim() } : {}),
    },
  });
  if (count === 0) return { error: "Exhibition not found." };
  return readRow(id);
}

// Its pictures, main first — at most MAX_EXHIBITION_IMAGES, from the
// artist's Media Catalogue.
export async function setExhibitionImages(
  id: string,
  artistId: string,
  imageIds: string[],
): Promise<Result<{ images: ArtworkImage[] }>> {
  await requireArtistAccess(artistId);
  const ids = [...new Set(imageIds)];
  if (ids.length > MAX_EXHIBITION_IMAGES) {
    return { error: `An exhibition can have at most ${MAX_EXHIBITION_IMAGES} pictures.` };
  }
  const exhibition = await db.exhibition.findFirst({ where: { id, artistId }, select: { id: true } });
  if (!exhibition) return { error: "Exhibition not found." };
  const images = await db.image.findMany({ where: { id: { in: ids }, artistId }, select: ARTWORK_IMAGE_SELECT });
  if (images.length !== ids.length) return { error: "One of those pictures couldn't be found." };

  await db.$transaction([
    db.exhibitionImage.deleteMany({ where: { exhibitionId: id } }),
    db.exhibitionImage.createMany({ data: ids.map((imageId, position) => ({ exhibitionId: id, imageId, position })) }),
  ]);
  const byId = new Map(images.map((img) => [img.id, img]));
  return { images: ids.map((imageId) => toArtworkImage(byId.get(imageId)!)) };
}

// Archives it (kept, listed apart), or brings it back.
export async function setExhibitionArchived(
  id: string,
  artistId: string,
  archived: boolean,
): Promise<Result<ExhibitionRow>> {
  await requireArtistAccess(artistId);
  const { count } = await db.exhibition.updateMany({
    where: { id, artistId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) return { error: "Exhibition not found." };
  return readRow(id);
}

// Deletes it for good (offered for archived ones only) — its pictures
// stay in the Media Catalogue.
export async function deleteExhibition(id: string, artistId: string): Promise<void> {
  await requireArtistAccess(artistId);
  await db.exhibition.deleteMany({ where: { id, artistId, archivedAt: { not: null } } });
}
