import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

const PAGE_SIZE = 24;

// Everything the Studio app's Consign / Sold / Payment screens need to
// know about one artwork: its tile in the catalogue grid, and the details
// shown once it is chosen.
export type StudioArtworkTile = {
  id: string;
  title: string;
  // "Type - Edition", the same line the Consigned Works tiles show —
  // empty when the artwork has neither.
  typeEdition: string;
  // "Type - Medium", shown as the description on the sale panel.
  typeMedium: string;
  size: string | null;
  // The artwork's price (Offered, or Consigned while at a gallery), e.g.
  // "450.00", and its currency — see Artwork.priceCurrency.
  price: string | null;
  priceCurrency: string;
  availability: "AVAILABLE" | "RESERVED" | "SOLD";
  thumbnailUrl: string | null;
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
        priceCurrency: true,
        availability: true,
        mainImage: { select: { url: true, thumbnailKey: true } },
        images: { take: 1, select: { url: true, thumbnailKey: true } },
      },
    }),
    db.artwork.count({ where }),
  ]);

  const artworks: StudioArtworkTile[] = rows.map((a) => {
    const image = a.mainImage ?? a.images[0] ?? null;
    return {
      id: a.id,
      title: a.catalogueName,
      typeEdition: [a.type, a.edition].filter(Boolean).join(" - "),
      typeMedium: [a.type, a.medium].filter(Boolean).join(" - "),
      size: a.size,
      price: a.offeredPrice != null ? a.offeredPrice.toString() : null,
      priceCurrency: a.priceCurrency,
      availability: a.availability,
      thumbnailUrl: image ? publicMediaUrl(image.thumbnailKey) || image.url : null,
    };
  });

  return { artworks, total };
}

// Consigning moves the artwork to one of the artist's Locations (a gallery
// or one of their own places) and saves the price and currency agreed for
// it there. Location is the same field the admin Catalogue edits, and what
// puts a work on a gallery's Consigned Works list (matched by name, see
// getGalleryDetail in actions/customers.ts). The price is the artwork's
// one price (Artwork.priceCurrency explains why), mirrored into
// presentationPrice exactly as updateCatalogue in actions/artworks.ts
// does. Like the Catalogue, it also fills "Can be viewed at" with the
// location's name, but only if that is still empty.
//
// Only that artist's own, still-available artworks can be consigned, and
// only to one of their own Locations.
export async function consignStudioArtwork(
  artistId: string,
  consignment: { artworkId: string; location: string; price: string; currency: string }
) {
  const { artworkId, location, price, currency } = consignment;
  const [known, artwork] = await Promise.all([
    db.location.findUnique({
      where: { artistId_name: { artistId, name: location } },
      select: { id: true },
    }),
    db.artwork.findFirst({
      where: { id: artworkId, artistId },
      select: { availability: true, viewingLocation: true },
    }),
  ]);

  if (!artwork) return { error: "Artwork not found.", status: 404 as const };
  if (artwork.availability !== "AVAILABLE") {
    return { error: "That work is already sold.", status: 409 as const };
  }
  if (!known) return { error: "That location isn't on your list.", status: 400 as const };

  await db.artwork.update({
    where: { id: artworkId },
    data: {
      location,
      offeredPrice: price,
      presentationPrice: price,
      priceCurrency: currency,
      ...(artwork.viewingLocation ? {} : { viewingLocation: location }),
    },
  });
  return { location };
}
