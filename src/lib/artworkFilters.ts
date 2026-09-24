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

function availabilitiesFor(filter: string): Availability[] {
  return filter === "SOLD" ? SOLD_AVAILABILITIES : [filter as Availability];
}

export type ArtworkFilterInput = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  // Tier filter (2026-09-07) — matches Artwork.tier exactly, same
  // convention as location/type below (Tier is now a Settings-editable
  // list, same pattern — see Artist.artworkTiers in schema.prisma).
  tier?: string;
  // Curation filter (2026-09-24) — a Curation's id (not its name, so a
  // rename never breaks a saved/bookmarked filter). Matches every
  // artwork in that curation. See Curation in schema.prisma.
  curation?: string;
};

export function buildArtworkWhere(artistId: string, filters: ArtworkFilterInput) {
  const { q, availability, location, type, group, tier, curation } = filters;
  return {
    artistId,
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
    ...(tier ? { tier } : {}),
    // A Group filter matches either facet's Group, since the same preset
    // list feeds both and it's not obvious to the user which one a given
    // artwork was tagged under.
    ...(group ? { OR: [{ catalogueGroup: group }, { presentationGroup: group }] } : {}),
    ...(curation ? { curationItems: { some: { curationId: curation } } } : {}),
  };
}

// Client-safe mirror of buildArtworkWhere's matching logic, for one
// specific case: after saving an edit to the currently-open artwork, the
// grid needs to know whether that artwork *still* belongs under the
// active filters (e.g. its Location was just changed away from the
// Location filter's current value) so it can drop the stale tile instead
// of leaving it sitting there until a full page reload (2026-08-16 bug —
// editing Location/Type/Group/Availability while filtered by that same
// field left the old grid tile in place). Deliberately kept as simple,
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
    catalogueNumber: string;
    medium: string | null;
    availability: string;
    location: string | null;
    type: string | null;
    catalogueGroup: string | null;
    presentationGroup: string | null;
    tier: string | null;
  },
  filters: ArtworkFilterInput
): boolean {
  const { q, availability, location, type, group, tier } = filters;
  if (q) {
    const needle = q.toLowerCase();
    const haystacks = [
      artwork.catalogueName,
      artwork.catalogueNumber,
      artwork.medium,
    ];
    if (!haystacks.some((h) => h && h.toLowerCase().includes(needle))) return false;
  }
  if (availability && !availabilitiesFor(availability).includes(artwork.availability as Availability)) {
    return false;
  }
  if (location && artwork.location !== location) return false;
  if (type && artwork.type !== type) return false;
  if (tier && artwork.tier !== tier) return false;
  if (group && artwork.catalogueGroup !== group && artwork.presentationGroup !== group) return false;
  return true;
}

// One fixed order, shared by the on-screen grid, the PDF and CSV
// exports and the Studio app (2026-09-24, direct request — was newest
// first): works still for sale A–Z first, then Reserved, then Sold at
// the bottom, each A–Z. Relies on the ArtworkAvailability enum's
// declared order (AVAILABLE, RESERVED, SOLD), which is how Postgres
// sorts an enum. The name sort ignores case and accents ("été" files
// under E, "the…" under T) because the catalogueName column uses a
// natural-language collation — see migration
// 20260924150000_artwork_name_natural_sort. createdAt is only a
// tie-break, so two works with the same name keep a stable order.
export function buildArtworkOrderBy() {
  return [
    { availability: "asc" as const },
    { catalogueName: "asc" as const },
    { createdAt: "asc" as const },
  ];
}
