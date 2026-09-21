import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

const PAGE_SIZE = 24;

// Everything one tile in the Studio app's "Manage existing" grid needs.
export type StudioArtworkTile = {
  id: string;
  title: string;
  // "Type - Edition", the same line the Consigned Works tiles show —
  // empty when the artwork has neither.
  typeEdition: string;
  group: string | null;
  availability: "AVAILABLE" | "RESERVED" | "SOLD";
  thumbnailUrl: string | null;
  displayUrl: string | null;
};

// One page of an artist's artworks for the Studio app, newest first, using
// the same filter and ordering as the admin Artwork Catalogue so a search
// means the same thing in both. The main image is preferred over the
// first related one, and the small thumbnail over the original file.
export async function listStudioArtworks(artistId: string, q: string, offset: number) {
  const where = buildArtworkWhere(artistId, { q: q || undefined });

  const [rows, total] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy: buildArtworkOrderBy(),
      skip: offset,
      take: PAGE_SIZE,
      select: {
        id: true,
        catalogueName: true,
        type: true,
        edition: true,
        catalogueGroup: true,
        availability: true,
        mainImage: { select: { url: true, thumbnailKey: true, displayKey: true } },
        images: { take: 1, select: { url: true, thumbnailKey: true, displayKey: true } },
      },
    }),
    db.artwork.count({ where }),
  ]);

  const artworks: StudioArtworkTile[] = rows.map((a) => {
    const image = a.mainImage ?? a.images[0] ?? null;
    const thumbnailUrl = image ? publicMediaUrl(image.thumbnailKey) || image.url : null;
    return {
      id: a.id,
      title: a.catalogueName,
      typeEdition: [a.type, a.edition].filter(Boolean).join(" - "),
      group: a.catalogueGroup,
      availability: a.availability,
      thumbnailUrl,
      displayUrl: image ? publicMediaUrl(image.displayKey) || thumbnailUrl : null,
    };
  });

  return { artworks, total };
}
