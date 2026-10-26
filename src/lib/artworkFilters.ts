// Deliberately NOT a "use server" file — artworks.ts has that directive,
// which requires every export to be an async function (Next.js Server
// Actions rule). These are synchronous, so they live here instead and
// get imported by both artworks.ts (the on-screen grid) and
// artworkCataloguePdf.ts (the PDF export), so there's one source of
// truth for what a filter means rather than two separately-typed copies
// that could drift apart (2026-08-15).

export type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

// What "Sold" means for the Sold filter and the "X sold" count
// (2026-09-24, direct request): RESERVED ("Sold - Not Paid") counts as
// sold too, so every committed sale shows under Sold, paid or not.
export const SOLD_AVAILABILITIES: Availability[] = ["RESERVED", "SOLD"];

// Whether a work shows the SOLD flag (components/SoldFlag.tsx) — the
// same meaning as the Sold filter. Undefined (a site published before
// curation works carried their availability) is not sold.
export function isSold(availability: string | undefined): boolean {
  return SOLD_AVAILABILITIES.includes(availability as Availability);
}

function availabilitiesFor(filter: string): Availability[] {
  return filter === "SOLD" ? SOLD_AVAILABILITIES : [filter as Availability];
}

export type ArtworkFilterInput = {
  // Free-text search (name, catalogue #, medium) — the artwork picker's.
  q?: string;
  // One exact artwork name (2026-10-13) — the Artwork Catalogue's Name
  // dropdown. Several works can share a name (different types).
  name?: string;
  availability?: string;
  location?: string;
  type?: string;
  // Curation filter (2026-09-24) — a Curation's id (not its name, so a
  // rename never breaks a saved/bookmarked filter). Matches every
  // artwork in that curation. See Curation in schema.prisma.
  curation?: string;
  // The order, not a filter (2026-10-26, direct request) — carried with
  // the filters so the grid, the URL and the PDF/CSV exports all follow
  // it. See ARTWORK_SORT_NUMBER and buildArtworkOrderBy.
  sort?: string;
};

// The one alternative to the standard order: catalogue number, lowest
// first, whatever the availability. Unset means the standard order.
export const ARTWORK_SORT_NUMBER = "number";

export function buildArtworkWhere(artistId: string, filters: ArtworkFilterInput) {
  const { q, name, availability, location, type, curation } = filters;
  return {
    artistId,
    ...(name ? { catalogueName: name } : {}),
    ...(q
      ? {
          OR: [
            { catalogueName: { contains: q, mode: "insensitive" as const } },
            { catalogueNumber: { contains: q, mode: "insensitive" as const } },
            { medium: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(availability ? { availability: { in: availabilitiesFor(availability) } } : {}),
    ...(location ? { location } : {}),
    ...(type ? { type } : {}),
    ...(curation ? { curationItems: { some: { curationId: curation } } } : {}),
  };
}

// Client-safe mirror of buildArtworkWhere's matching logic, for one
// specific case: after saving an edit to the currently-open artwork, the
// grid needs to know whether that artwork *still* belongs under the
// active filters (e.g. its Location was just changed away from the
// Location filter's current value) so it can drop the stale tile instead
// of leaving it sitting there until a full page reload (2026-08-16 bug —
// editing Location/Type/Availability while filtered by that same field
// left the old grid tile in place). Deliberately kept as simple,
// obviously-equivalent JS next to buildArtworkWhere rather than trying to
// share one implementation across a Prisma `where` clause and a plain
// object check — but any change to what a filter *means* should be made
// in both places together.
//
// The Curation filter is the one exception, and needs no check here:
// editing an artwork never changes which curations it's in (that's only
// done from the Curations page), so an edit can't take it out of the
// curation being filtered on.
export function artworkMatchesFilters(
  artwork: {
    catalogueName: string;
    availability: string;
    location: string | null;
    type: string | null;
  },
  filters: ArtworkFilterInput
): boolean {
  const { name, availability, location, type } = filters;
  if (name && artwork.catalogueName !== name) return false;
  if (availability && !availabilitiesFor(availability).includes(artwork.availability as Availability)) {
    return false;
  }
  if (location && artwork.location !== location) return false;
  if (type && artwork.type !== type) return false;
  return true;
}

// The order shared by the on-screen grid, the PDF and CSV exports and
// the Studio app. Standard (2026-09-24, direct request — was newest
// first): works still for sale A–Z first, then Reserved, then Sold at
// the bottom, each A–Z. Relies on the ArtworkAvailability enum's
// declared order (AVAILABLE, RESERVED, SOLD), which is how Postgres
// sorts an enum. The name sort ignores case and accents ("été" files
// under E, "the…" under T) because the catalogueName column uses a
// natural-language collation — see migration
// 20260924150000_artwork_name_natural_sort. createdAt is only a
// tie-break, so two works with the same name keep a stable order.
//
// Sorted by catalogue number instead (2026-10-26, direct request) when
// the Artwork Catalogue or the Media Catalogue's Artworks view asks.
// Numbers are always generated as AW- plus four digits
// (nextCatalogueNumber in lib/actions/artworks.ts), so a plain text
// sort puts them in number order.
export function buildArtworkOrderBy(sort?: string) {
  if (sort === ARTWORK_SORT_NUMBER) {
    return [{ catalogueNumber: "asc" as const }, { createdAt: "asc" as const }];
  }
  return [
    { availability: "asc" as const },
    { catalogueName: "asc" as const },
    { createdAt: "asc" as const },
  ];
}
