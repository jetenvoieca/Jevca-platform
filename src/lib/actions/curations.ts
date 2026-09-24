"use server";

import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";

// Curations (2026-09-24) — named, ordered selections of an artist's
// artworks. See the note on Curation in schema.prisma.
//
// Every action takes the artistId and only ever touches a curation that
// belongs to that artist, so one artist's curations can never be read
// or changed from another artist's pages.
//
// No revalidatePath here, same reasoning as actions/artworks.ts: the
// Curations page keeps its own state up to date from what these return,
// and revalidating the page being viewed would force a full refresh.

export type CurationSummary = {
  id: string;
  name: string;
};

export type CurationWork = {
  artworkId: string;
  catalogueName: string;
  offeredPrice: string | null;
  imageUrl: string | null;
};

export type CurationDetail = {
  id: string;
  name: string;
  works: CurationWork[];
};

type Result<T> = T | { error: string };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002"
  );
}

async function ownsCuration(curationId: string, artistId: string): Promise<boolean> {
  const row = await db.curation.findFirst({
    where: { id: curationId, artistId },
    select: { id: true },
  });
  return Boolean(row);
}

// The list on the right of the Curations page, and the options in the
// Artwork Catalogue's Curations filter. Oldest first, so a new curation
// is added to the bottom of the list.
export async function listCurations(artistId: string): Promise<CurationSummary[]> {
  return db.curation.findMany({
    where: { artistId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

// One curation with its works, in their curated order. Image is the
// artwork's Main image (falling back to its first image), as a small
// thumbnail — same choice the Artwork Catalogue grid makes.
export async function getCuration(
  curationId: string,
  artistId: string
): Promise<CurationDetail | null> {
  const row = await db.curation.findFirst({
    where: { id: curationId, artistId },
    select: {
      id: true,
      name: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          artwork: {
            select: {
              id: true,
              catalogueName: true,
              offeredPrice: true,
              mainImage: { select: { url: true, thumbnailKey: true } },
              images: { take: 1, select: { url: true, thumbnailKey: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    works: row.items.map(({ artwork }) => {
      const image = artwork.mainImage || artwork.images[0] || null;
      return {
        artworkId: artwork.id,
        catalogueName: artwork.catalogueName,
        offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
        imageUrl: image ? publicMediaUrl(image.thumbnailKey) || image.url : null,
      };
    }),
  };
}

export async function createCuration(
  artistId: string,
  nameRaw: string
): Promise<Result<CurationSummary>> {
  const name = nameRaw.trim();
  if (!name) return { error: "A name is required." };
  try {
    return await db.curation.create({
      data: { artistId, name },
      select: { id: true, name: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A curation with this name already exists." };
    throw err;
  }
}

export async function renameCuration(
  curationId: string,
  artistId: string,
  nameRaw: string
): Promise<Result<CurationSummary>> {
  const name = nameRaw.trim();
  if (!name) return { error: "A name is required." };
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  try {
    return await db.curation.update({
      where: { id: curationId },
      data: { name },
      select: { id: true, name: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A curation with this name already exists." };
    throw err;
  }
}

// Removes the curation and its list of works. The artworks themselves
// are never touched.
export async function deleteCuration(curationId: string, artistId: string): Promise<void> {
  await db.curation.deleteMany({ where: { id: curationId, artistId } });
}

// Adds works to the end of the curation, in the order they were picked.
// Works already in the curation, or not belonging to this artist, are
// skipped. Returns the updated curation.
export async function addWorksToCuration(
  curationId: string,
  artistId: string,
  artworkIds: string[]
): Promise<Result<CurationDetail>> {
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };

  if (artworkIds.length > 0) {
    const [owned, existing, last] = await Promise.all([
      db.artwork.findMany({
        where: { id: { in: artworkIds }, artistId },
        select: { id: true },
      }),
      db.curationItem.findMany({
        where: { curationId, artworkId: { in: artworkIds } },
        select: { artworkId: true },
      }),
      db.curationItem.findFirst({
        where: { curationId },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
    ]);

    const ownedIds = new Set(owned.map((a) => a.id));
    const existingIds = new Set(existing.map((e) => e.artworkId));
    const toAdd = [...new Set(artworkIds)].filter(
      (id) => ownedIds.has(id) && !existingIds.has(id)
    );
    const start = last ? last.position + 1 : 0;

    if (toAdd.length > 0) {
      await db.curationItem.createMany({
        data: toAdd.map((artworkId, i) => ({ curationId, artworkId, position: start + i })),
        skipDuplicates: true,
      });
    }
  }

  const updated = await getCuration(curationId, artistId);
  return updated ?? { error: "Curation not found." };
}

// Takes one work out of the curation. The artwork itself is untouched.
export async function removeWorkFromCuration(
  curationId: string,
  artistId: string,
  artworkId: string
): Promise<Result<{ ok: true }>> {
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  await db.curationItem.deleteMany({ where: { curationId, artworkId } });
  return { ok: true };
}

// Saves a new order after a drag and drop. `artworkIds` is the whole
// curation in its new order. Done as one database statement, however
// many works the curation holds.
export async function reorderCuration(
  curationId: string,
  artistId: string,
  artworkIds: string[]
): Promise<Result<{ ok: true }>> {
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  if (artworkIds.length === 0) return { ok: true };

  await db.$executeRaw`
    UPDATE "CurationItem" AS ci
    SET "position" = (x.ord - 1)::int
    FROM unnest(${artworkIds}::text[]) WITH ORDINALITY AS x(aid, ord)
    WHERE ci."curationId" = ${curationId} AND ci."artworkId" = x.aid
  `;
  return { ok: true };
}
