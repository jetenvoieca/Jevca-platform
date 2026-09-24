import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

const PAGE_SIZE = 24;

// Everything the Studio app's "Manage existing" screens need to know about
// one artwork: its tile in the grid, and the details shown when it is
// chosen.
export type StudioArtworkTile = {
  id: string;
  title: string;
  // "Type - Edition", the same line the Consigned Works tiles show —
  // empty when the artwork has neither.
  typeEdition: string;
  // "Type - Medium", shown as the description on the sale panel.
  typeMedium: string;
  size: string | null;
  // The artwork's asking price (Offered price), e.g. "450.00".
  price: string | null;
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
        medium: true,
        size: true,
        offeredPrice: true,
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
      typeMedium: [a.type, a.medium].filter(Boolean).join(" - "),
      size: a.size,
      price: a.offeredPrice != null ? a.offeredPrice.toString() : null,
      availability: a.availability,
      thumbnailUrl,
      displayUrl: image ? publicMediaUrl(image.displayKey) || thumbnailUrl : null,
    };
  });

  return { artworks, total };
}

// Consigning sets the artwork's Location to the chosen entry from the
// artist's own Locations list — the same field the admin Catalogue
// edits, and what puts a work on a gallery's Consigned Works list
// (matched by name, see getGalleryDetail in actions/customers.ts). Like
// the admin Catalogue (updateCatalogue in actions/artworks.ts), it also
// fills "Can be viewed at" with the same name, but only if that is still
// empty — never overwriting one already set.
//
// Only that artist's own, still-available artworks can be consigned, and
// only to a location that really is on their list.
export async function consignStudioArtwork(artistId: string, artworkId: string, location: string) {
  const [artist, artwork] = await Promise.all([
    db.artist.findUnique({ where: { id: artistId }, select: { artworkLocations: true } }),
    db.artwork.findFirst({
      where: { id: artworkId, artistId },
      select: { availability: true, viewingLocation: true },
    }),
  ]);

  if (!artwork) return { error: "Artwork not found.", status: 404 as const };
  if (artwork.availability !== "AVAILABLE") {
    return { error: "That work is already sold.", status: 409 as const };
  }
  if (!artist?.artworkLocations.includes(location)) {
    return { error: "That location isn't on your list.", status: 400 as const };
  }

  await db.artwork.update({
    where: { id: artworkId },
    data: {
      location,
      ...(artwork.viewingLocation ? {} : { viewingLocation: location }),
    },
  });
  return { location };
}
