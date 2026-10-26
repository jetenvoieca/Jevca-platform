import { db } from "@/lib/db";

// A client's artwork settings and Locations, read (moved here from the
// actions files, 2026-10-26): plain server code, used through the checked
// actions getArtworkSettings / listLocations, and directly by the Studio
// app, which checks its own client token.

export type LocationType = "GALLERY" | "OWN";

export type LocationSummary = {
  id: string;
  name: string;
  type: LocationType;
  customerId: string;
};

// The single canonical list a Location picker offers (2026-09-22) —
// replaces the old free-text Artist.artworkLocations. See the note on
// Location in schema.prisma. Used by the Artwork Catalogue's Location
// dropdown and the Settings screen's Locations card.
export async function readLocations(artistId: string): Promise<LocationSummary[]> {
  const rows = await db.location.findMany({
    where: { artistId },
    select: { id: true, name: true, type: true, customerId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, type: r.type as LocationType }));
}

// These presets belong to the Artist now (same reasoning as Artwork
// ownership) — shared across all of that artist's sites, not duplicated
// per site.
//
// Types moved off this plain-string-list mechanism entirely (2026-08-28)
// — a real Type now carries a numeric Ref value (see ArtworkType in
// schema.prisma), which addSettingOption/removeSettingOption below have
// nowhere to hold. `artworkTypes` here stays a plain string[] of just
// the names, for the several places that only ever needed a name to
// populate a dropdown/filter (HopperView, ArtworksCatalogueView) —
// `artworkTypeRecords` alongside it carries the full {id, name,
// refValue} shape for the Settings screen and the Catalogue tab's
// Reference price calculation.
//
// Locations moved off this same mechanism (2026-09-22) — same reasoning
// as Types: a Location now carries a real Type (Gallery/Own) and a
// linked Customer record (see Location in schema.prisma), which this
// plain-string-list mechanism has nowhere to hold. `locations` below
// carries the full {id, name, type, customerId} shape everywhere that
// used to read `artworkLocations` — the Artwork Catalogue's Location
// dropdown, the Settings screen's Locations card, and the "Sold"
// button's routing.
//
// Groups and Tiers removed (2026-09-24) — replaced by Curations.
export async function readArtworkSettings(artistId: string) {
  const [artist, artworkTypeRows, locations] = await Promise.all([
    db.artist.findUnique({
      where: { id: artistId },
      select: {
        kind: true,
        mediumPresets: true,
        sizePresets: true,
        saleSources: true,
        paymentMethods: true,
        defaultInstalmentCount: true,
      },
    }),
    db.artworkType.findMany({ where: { artistId }, orderBy: { name: "asc" } }),
    readLocations(artistId),
  ]);
  if (!artist) throw new Error("Artist not found.");

  return {
    // Artist or brand — decides the wording (lib/clientKind.ts).
    clientKind: artist.kind,
    artworkTypes: artworkTypeRows.map((t) => t.name),
    artworkTypeRecords: artworkTypeRows.map((t) => ({
      id: t.id,
      name: t.name,
      refValue: t.refValue.toString(),
    })),
    locations,
    mediumPresets: artist.mediumPresets,
    sizePresets: artist.sizePresets,
    saleSources: artist.saleSources,
    paymentMethods: artist.paymentMethods,
    defaultInstalmentCount: artist.defaultInstalmentCount,
  };
}
