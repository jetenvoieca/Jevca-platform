import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { buildArtworkWhere, buildArtworkOrderBy } from "@/lib/artworkFilters";

const PAGE_SIZE = 24;

// Everything the Studio app's Consign / Sold / Payment screens need to
// know about one unsold artwork: its tile in the catalogue grid, and the
// details shown once it is chosen.
export type StudioArtworkTile = {
  id: string;
  title: string;
  catalogueNumber: string;
  // "Type - Edition", the same line the Consigned Works tiles show —
  // empty when the artwork has neither.
  typeEdition: string;
  type: string | null;
  edition: string | null;
  size: string | null;
  // Where the work is now — one of the artist's Locations, by name.
  location: string | null;
  // The artwork's price (Offered, or Consigned while at a gallery), e.g.
  // "450.00", and its currency — see Artwork.priceCurrency.
  price: string | null;
  priceCurrency: string;
  thumbnailUrl: string | null;
  // The larger version, for the Payment panel's enlarged view.
  displayUrl: string | null;
};

// One page of an artist's unsold artworks for the Studio app (every sold
// work, paid or not, is left out), newest first, using the same filter and
// ordering as the admin Artwork Catalogue. The main image is preferred
// over the first related one, and the small thumbnail over the original
// file.
export async function listStudioArtworks(artistId: string, offset: number) {
  const where = buildArtworkWhere(artistId, { availability: "AVAILABLE" });

  const [rows, total] = await Promise.all([
    db.artwork.findMany({
      where,
      orderBy: buildArtworkOrderBy(),
      skip: offset,
      take: PAGE_SIZE,
      select: {
        id: true,
        catalogueName: true,
        catalogueNumber: true,
        type: true,
        edition: true,
        size: true,
        location: true,
        offeredPrice: true,
        priceCurrency: true,
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
      catalogueNumber: a.catalogueNumber,
      typeEdition: [a.type, a.edition].filter(Boolean).join(" - "),
      type: a.type,
      edition: a.edition,
      size: a.size,
      location: a.location,
      price: a.offeredPrice != null ? a.offeredPrice.toString() : null,
      priceCurrency: a.priceCurrency,
      thumbnailUrl,
      displayUrl: image ? publicMediaUrl(image.displayKey) || thumbnailUrl : null,
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
