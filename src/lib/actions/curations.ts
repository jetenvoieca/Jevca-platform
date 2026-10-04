"use server";

import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { toArtworkImages, type ArtworkImage } from "@/lib/artworkImages";

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
  priceCurrency: string;
  imageUrl: string | null;
};

export type CurationDetail = {
  id: string;
  name: string;
  works: CurationWork[];
};

// One work's presentation within a curation (2026-10-03) — shown beside
// the works on the Curations page when that work is selected.
// Description and images are this curation's own: Description is null
// until written (defaultDescription is shown instead), and images are the
// Catalogue's until changed here (see CurationItem.ownImages). Name and
// price are the artwork's own, so editing them here changes them
// everywhere. The number of instalments is the artist's Settings
// default — artworks don't have their own.
export type CurationWorkPresentation = {
  artworkId: string;
  catalogueName: string;
  description: string | null;
  defaultDescription: string | null;
  offeredPrice: string | null;
  priceCurrency: string;
  defaultInstalmentCount: number;
  // Main first — this curation's main image is images[0].
  images: ArtworkImage[];
};

// A work's images in a curation: up to 4, main first — the same limit as
// an artwork's own images.
const MAX_CURATION_IMAGES = 4;

const IMAGE_FIELDS = {
  id: true,
  url: true,
  thumbnailKey: true,
  displayKey: true,
  kind: true,
  posterUrl: true,
} as const;

type Result<T> = T | { error: string };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002"
  );
}

// What a work's Description shows until one is written for it: the
// artwork's Type, Size and Medium, one per line, skipping any that are
// blank. Worked out each time it's shown, so it always matches the
// Catalogue.
function defaultDescription(artwork: {
  type: string | null;
  size: string | null;
  medium: string | null;
}): string | null {
  const lines = [artwork.type, artwork.size, artwork.medium]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return lines.length > 0 ? lines.join("\n") : null;
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
// work's main image in this curation (see CurationItem.ownImages) — the
// Catalogue's Main, falling back to its first image, until changed here —
// as a small thumbnail.
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
          ownImages: true,
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { image: { select: { url: true, thumbnailKey: true } } },
          },
          artwork: {
            select: {
              id: true,
              catalogueName: true,
              offeredPrice: true,
              priceCurrency: true,
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
    works: row.items.map(({ ownImages, images, artwork }) => {
      const image = ownImages
        ? images[0]?.image ?? null
        : artwork.mainImage || artwork.images[0] || null;
      return {
        artworkId: artwork.id,
        catalogueName: artwork.catalogueName,
        offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
        priceCurrency: artwork.priceCurrency,
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

// One work's presentation within a curation — see
// CurationWorkPresentation above. Loaded only for the work being viewed,
// so opening a curation stays quick however many works it holds.
export async function getCurationWorkPresentation(
  curationId: string,
  artistId: string,
  artworkId: string
): Promise<CurationWorkPresentation | null> {
  const item = await db.curationItem.findFirst({
    where: { curationId, artworkId, curation: { artistId } },
    select: {
      description: true,
      ownImages: true,
      images: { orderBy: { position: "asc" }, select: { image: { select: IMAGE_FIELDS } } },
      artwork: {
        select: {
          catalogueName: true,
          type: true,
          size: true,
          medium: true,
          offeredPrice: true,
          priceCurrency: true,
          mainImageId: true,
          images: { select: IMAGE_FIELDS },
          artist: { select: { defaultInstalmentCount: true } },
        },
      },
    },
  });
  if (!item) return null;

  const { artwork } = item;
  return {
    artworkId,
    catalogueName: artwork.catalogueName,
    description: item.description,
    defaultDescription: defaultDescription(artwork),
    offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
    priceCurrency: artwork.priceCurrency,
    defaultInstalmentCount: artwork.artist.defaultInstalmentCount,
    images: item.ownImages
      ? toArtworkImages(
          item.images.map((i) => i.image),
          null
        )
      : toArtworkImages(artwork.images, artwork.mainImageId),
  };
}

// Sets a work's whole image set within this curation — `imageIds` in
// order, main first. The first change gives the work its own set (see
// CurationItem.ownImages); the artwork and the Catalogue are never
// touched. Only the artist's own images are accepted. Returns the saved
// set.
export async function setCurationWorkImages(
  curationId: string,
  artistId: string,
  artworkId: string,
  imageIds: string[]
): Promise<Result<{ images: ArtworkImage[] }>> {
  const ids = [...new Set(imageIds)];
  if (ids.length > MAX_CURATION_IMAGES) {
    return { error: `A work can have at most ${MAX_CURATION_IMAGES} images.` };
  }

  const item = await db.curationItem.findFirst({
    where: { curationId, artworkId, curation: { artistId } },
    select: { id: true },
  });
  if (!item) return { error: "This work is no longer in the curation." };

  const images = await db.image.findMany({
    where: { id: { in: ids }, artistId },
    select: IMAGE_FIELDS,
  });
  if (images.length !== ids.length) return { error: "One of those images couldn't be found." };

  await db.$transaction([
    db.curationItemImage.deleteMany({ where: { curationItemId: item.id } }),
    db.curationItemImage.createMany({
      data: ids.map((imageId, position) => ({ curationItemId: item.id, imageId, position })),
    }),
    db.curationItem.update({ where: { id: item.id }, data: { ownImages: true } }),
  ]);

  const byId = new Map(images.map((img) => [img.id, img]));
  return {
    images: toArtworkImages(
      ids.map((id) => byId.get(id)!),
      null
    ),
  };
}

// Saves a work's Description within this curation only. From then on
// it's kept as written — saving it blank keeps it blank rather than
// going back to the default.
export async function updateCurationWorkDescription(
  curationId: string,
  artistId: string,
  artworkId: string,
  descriptionRaw: string
): Promise<Result<{ description: string }>> {
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  const description = descriptionRaw.trim();
  const { count } = await db.curationItem.updateMany({
    where: { curationId, artworkId },
    data: { description },
  });
  if (count === 0) return { error: "This work is no longer in the curation." };
  return { description };
}
