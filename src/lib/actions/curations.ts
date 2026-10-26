"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { EMAIL_DOMAIN } from "@/lib/email";
import { publicMediaUrl } from "@/lib/r2";
import { artworkDetailLines } from "@/lib/artworkDetails";
import { toArtworkImages, type ArtworkImage } from "@/lib/artworkImages";
import { CURATION_SECTION_TYPES } from "@/lib/curationSections";

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

// A curation as it appears on a canvas (2026-10-05): its name and its
// first work's main image, in the larger size.
export type CurationCover = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type CurationWork = {
  artworkId: string;
  catalogueName: string;
  // Shown beside the name on the Curations page (2026-10-26), since
  // several works can share a name.
  catalogueNumber: string;
  // For the SOLD flag (2026-10-26) on the Curations page, the website
  // and presentations — see isSold in lib/artworkFilters.ts.
  availability: string;
  offeredPrice: string | null;
  priceCurrency: string;
  // The work's main image in this curation: a small thumbnail for
  // tiles, and a larger version (2026-10-05) for full-screen display
  // such as Sliding doors.
  imageUrl: string | null;
  displayUrl: string | null;
};

export type CurationDetail = {
  id: string;
  name: string;
  // The text of the curation's first Description section (2026-10-06),
  // null if it has none — what page styles show as the curation's
  // description. Edited on the Curations page; see CurationSection in
  // schema.prisma.
  description: string | null;
  works: CurationWork[];
};

// One work's presentation within a curation (2026-10-03) — shown beside
// the works on the Curations page when that work is selected.
// Description and images are this curation's own: images are the
// Catalogue's until changed here (see CurationItem.ownImages). Name,
// Presentation medium and price are the artwork's own, so editing them
// here changes them everywhere. The number of instalments is the artist's Settings
// default — artworks don't have their own.
export type CurationWorkPresentation = {
  artworkId: string;
  catalogueName: string;
  // Exactly what the Presentation panel shows and the website shows —
  // never anything else (2026-10-26, direct request: fallbacks confuse).
  // This curation's own wording once written; until then the artwork's
  // Type, Size and Medium (kept current with the Catalogue); "" once
  // deleted, which shows nothing.
  description: string;
  offeredPrice: string | null;
  priceCurrency: string;
  defaultInstalmentCount: number;
  // Main first — this curation's main image is images[0].
  images: ArtworkImage[];
  // For the Presentation window's details (2026-10-19 — see
  // lib/presentationTemplate.ts): the artwork's Presentation medium —
  // the Catalogue's Medium until changed in the Presentation panel, ""
  // once deleted, which shows nothing — edition, type, size, where it can
  // be seen, whether it's still for sale, the artist's release message
  // (shown with the instalment terms) and where enquiries go; for the
  // enquiry form, the artist's first name and Instagram username (absent
  // from sites published before them).
  medium: string | null;
  edition: string | null;
  type: string | null;
  size: string | null;
  viewingLocation: string | null;
  available: boolean;
  releaseMessage: string;
  enquiryEmail: string | null;
  artistFirstName?: string;
  instagramHandle?: string | null;
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

// What a work's tile needs of an image, and of the curation item and
// artwork to find its main image in this curation.
const TILE_IMAGE_FIELDS = { url: true, thumbnailKey: true, displayKey: true } as const;

const TILE_ITEM_IMAGES = {
  ownImages: true,
  images: {
    orderBy: { position: "asc" },
    take: 1,
    select: { image: { select: TILE_IMAGE_FIELDS } },
  },
} as const;

const TILE_ARTWORK_IMAGES = {
  mainImage: { select: TILE_IMAGE_FIELDS },
  images: { take: 1, select: TILE_IMAGE_FIELDS },
} as const;

type TileImage = { url: string; thumbnailKey: string | null; displayKey: string | null };

// A work's main image in a curation (see CurationItem.ownImages) — the
// Catalogue's Main, falling back to its first image, until changed on
// the Curations page — as a small thumbnail and a larger version. Each
// falls back to the original file when its smaller versions haven't
// been generated.
function tileUrls(item: {
  ownImages: boolean;
  images: { image: TileImage }[];
  artwork: { mainImage: TileImage | null; images: TileImage[] };
}): { imageUrl: string | null; displayUrl: string | null } {
  const image = item.ownImages
    ? (item.images[0]?.image ?? null)
    : item.artwork.mainImage || item.artwork.images[0] || null;
  if (!image) return { imageUrl: null, displayUrl: null };
  return {
    imageUrl: publicMediaUrl(image.thumbnailKey) || image.url,
    displayUrl: publicMediaUrl(image.displayKey) || publicMediaUrl(image.thumbnailKey) || image.url,
  };
}

type Result<T> = T | { error: string };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// What a work's Description is until one is written for it: the
// artwork's Type, Size and Medium, one per line, skipping any that are
// blank. Worked out each time it's shown, so it always matches the
// Catalogue.
function defaultDescription(artwork: {
  type: string | null;
  size: string | null;
  medium: string | null;
}): string | null {
  const lines = artworkDetailLines(artwork);
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
  await requireArtistAccess(artistId);
  return db.curation.findMany({
    where: { artistId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

// Every curation with its cover (2026-10-05) — for placing curations on
// a canvas. Same order as listCurations.
export async function listCurationCovers(artistId: string): Promise<CurationCover[]> {
  await requireArtistAccess(artistId);
  const rows = await db.curation.findMany({
    where: { artistId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      items: {
        orderBy: { position: "asc" },
        take: 1,
        select: { ...TILE_ITEM_IMAGES, artwork: { select: TILE_ARTWORK_IMAGES } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    imageUrl: r.items[0] ? tileUrls(r.items[0]).displayUrl : null,
  }));
}

// One curation with its works, in their curated order, each with its
// main image in this curation (see tileUrls), and its description (see
// CurationDetail).
export async function getCuration(curationId: string, artistId: string): Promise<CurationDetail | null> {
  await requireArtistAccess(artistId);
  const row = await db.curation.findFirst({
    where: { id: curationId, artistId },
    select: {
      id: true,
      name: true,
      sections: {
        where: { type: "DESCRIPTION" },
        select: { text: true },
      },
      items: {
        orderBy: { position: "asc" },
        select: {
          ...TILE_ITEM_IMAGES,
          artwork: {
            select: {
              id: true,
              catalogueName: true,
              catalogueNumber: true,
              availability: true,
              offeredPrice: true,
              priceCurrency: true,
              ...TILE_ARTWORK_IMAGES,
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
    description: row.sections[0]?.text ?? null,
    works: row.items.map((item) => ({
      artworkId: item.artwork.id,
      catalogueName: item.artwork.catalogueName,
      catalogueNumber: item.artwork.catalogueNumber,
      availability: item.artwork.availability,
      offeredPrice: item.artwork.offeredPrice != null ? item.artwork.offeredPrice.toString() : null,
      priceCurrency: item.artwork.priceCurrency,
      ...tileUrls(item),
    })),
  };
}

export async function createCuration(artistId: string, nameRaw: string): Promise<Result<CurationSummary>> {
  await requireArtistAccess(artistId);
  const name = nameRaw.trim();
  if (!name) return { error: "A name is required." };
  try {
    // Made with its three presentation sections (2026-10-13) — see
    // CurationSection in schema.prisma.
    return await db.curation.create({
      data: {
        artistId,
        name,
        sections: {
          create: CURATION_SECTION_TYPES.map((t) => ({ type: t.value })),
        },
      },
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
  nameRaw: string,
): Promise<Result<CurationSummary>> {
  await requireArtistAccess(artistId);
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

// Removes the curation, its list of works and its sections. The
// artworks themselves are never touched.
export async function deleteCuration(curationId: string, artistId: string): Promise<void> {
  await requireArtistAccess(artistId);
  await db.curation.deleteMany({ where: { id: curationId, artistId } });
}

// Adds works to the end of the curation, in the order they were picked.
// Works already in the curation, or not belonging to this artist, are
// skipped. Returns the updated curation.
export async function addWorksToCuration(
  curationId: string,
  artistId: string,
  artworkIds: string[],
): Promise<Result<CurationDetail>> {
  await requireArtistAccess(artistId);
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
    const toAdd = [...new Set(artworkIds)].filter((id) => ownedIds.has(id) && !existingIds.has(id));
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
  artworkId: string,
): Promise<Result<{ ok: true }>> {
  await requireArtistAccess(artistId);
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
  artworkIds: string[],
): Promise<Result<{ ok: true }>> {
  await requireArtistAccess(artistId);
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
  artworkId: string,
): Promise<CurationWorkPresentation | null> {
  await requireArtistAccess(artistId);
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
          presentationMedium: true,
          edition: true,
          viewingLocation: true,
          availability: true,
          offeredPrice: true,
          priceCurrency: true,
          mainImageId: true,
          images: { select: IMAGE_FIELDS },
          artist: {
            select: {
              defaultInstalmentCount: true,
              defaultReleaseMessage: true,
              emailSlug: true,
              email: true,
              name: true,
              firstName: true,
              instagramHandle: true,
            },
          },
        },
      },
    },
  });
  if (!item) return null;

  const { artwork } = item;
  return {
    artworkId,
    catalogueName: artwork.catalogueName,
    description: item.description ?? defaultDescription(artwork) ?? "",
    offeredPrice: artwork.offeredPrice != null ? artwork.offeredPrice.toString() : null,
    priceCurrency: artwork.priceCurrency,
    defaultInstalmentCount: artwork.artist.defaultInstalmentCount,
    images: item.ownImages
      ? toArtworkImages(
          item.images.map((i) => i.image),
          null,
        )
      : toArtworkImages(artwork.images, artwork.mainImageId),
    medium: artwork.presentationMedium ?? artwork.medium,
    edition: artwork.edition,
    type: artwork.type,
    size: artwork.size,
    viewingLocation: artwork.viewingLocation,
    available: artwork.availability === "AVAILABLE",
    releaseMessage: artwork.artist.defaultReleaseMessage,
    // The artist's own address, so enquiries arrive in the Inbox.
    enquiryEmail: artwork.artist.emailSlug ? `${artwork.artist.emailSlug}@${EMAIL_DOMAIN}` : artwork.artist.email,
    artistFirstName: artwork.artist.firstName || artwork.artist.name,
    instagramHandle: artwork.artist.instagramHandle,
  };
}

// Sets a work's whole image set within this curation — `imageIds` in
// order, main first. The first change gives the work its own set (see
// CurationItem.ownImages); the artwork and the Catalogue are never
// touched. Only the artist's own images are accepted. The current main
// image must stay in the set (2026-10-04) — it can be swapped for another
// image, never simply removed. Returns the saved set.
export async function setCurationWorkImages(
  curationId: string,
  artistId: string,
  artworkId: string,
  imageIds: string[],
): Promise<Result<{ images: ArtworkImage[] }>> {
  await requireArtistAccess(artistId);
  const ids = [...new Set(imageIds)];
  if (ids.length > MAX_CURATION_IMAGES) {
    return { error: `A work can have at most ${MAX_CURATION_IMAGES} images.` };
  }

  const item = await db.curationItem.findFirst({
    where: { curationId, artworkId, curation: { artistId } },
    select: {
      id: true,
      ownImages: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { imageId: true } },
      artwork: { select: { mainImageId: true, images: { take: 1, select: { id: true } } } },
    },
  });
  if (!item) return { error: "This work is no longer in the curation." };

  // The main image as shown now: this curation's own, or the Catalogue's.
  const currentMainId = item.ownImages
    ? (item.images[0]?.imageId ?? null)
    : (item.artwork.mainImageId ?? item.artwork.images[0]?.id ?? null);
  if (currentMainId && !ids.includes(currentMainId)) {
    return { error: "The main image can't be removed — make another image main instead." };
  }

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
      null,
    ),
  };
}

// Saves a work's Description within this curation only. From then on
// it's kept as written — saving it blank keeps it blank (nothing shown)
// rather than going back to the default.
export async function updateCurationWorkDescription(
  curationId: string,
  artistId: string,
  artworkId: string,
  descriptionRaw: string,
): Promise<Result<{ description: string }>> {
  await requireArtistAccess(artistId);
  if (!(await ownsCuration(curationId, artistId))) return { error: "Curation not found." };
  const description = descriptionRaw.trim();
  const { count } = await db.curationItem.updateMany({
    where: { curationId, artworkId },
    data: { description },
  });
  if (count === 0) return { error: "This work is no longer in the curation." };
  return { description };
}
