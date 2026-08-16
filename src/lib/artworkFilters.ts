// Deliberately NOT a "use server" file — artworks.ts has that directive,
// which requires every export to be an async function (Next.js Server
// Actions rule). These are synchronous, so they live here instead and
// get imported by both artworks.ts (the on-screen grid) and
// artworkCataloguePdf.ts (the PDF export), so there's one source of
// truth for what a filter means rather than two separately-typed copies
// that could drift apart (2026-08-15).

export type Availability = "AVAILABLE" | "RESERVED" | "SOLD";

export type ArtworkFilterInput = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
};

export function buildArtworkWhere(artistId: string, filters: ArtworkFilterInput) {
  const { q, availability, location, type, group } = filters;
  return {
    artistId,
    ...(q
      ? {
          OR: [
            { presentationTitle: { contains: q, mode: "insensitive" as const } },
            { catalogueName: { contains: q, mode: "insensitive" as const } },
            { catalogueNumber: { contains: q, mode: "insensitive" as const } },
            { medium: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(availability ? { availability: availability as Availability } : {}),
    ...(location ? { location } : {}),
    ...(type ? { type } : {}),
    // A Group filter matches either facet's Group, since the same preset
    // list feeds both and it's not obvious to the user which one a given
    // artwork was tagged under.
    ...(group ? { OR: [{ catalogueGroup: group }, { presentationGroup: group }] } : {}),
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
export function artworkMatchesFilters(
  artwork: {
    presentationTitle: string;
    catalogueName: string;
    catalogueNumber: string;
    medium: string | null;
    availability: string;
    location: string | null;
    type: string | null;
    catalogueGroup: string | null;
    presentationGroup: string | null;
  },
  filters: ArtworkFilterInput
): boolean {
  const { q, availability, location, type, group } = filters;
  if (q) {
    const needle = q.toLowerCase();
    const haystacks = [
      artwork.presentationTitle,
      artwork.catalogueName,
      artwork.catalogueNumber,
      artwork.medium,
    ];
    if (!haystacks.some((h) => h && h.toLowerCase().includes(needle))) return false;
  }
  if (availability && artwork.availability !== availability) return false;
  if (location && artwork.location !== location) return false;
  if (type && artwork.type !== type) return false;
  if (group && artwork.catalogueGroup !== group && artwork.presentationGroup !== group) return false;
  return true;
}

export function buildArtworkOrderBy(sort?: string) {
  return {
    presentationPrice: sort === "price" ? ("desc" as const) : undefined,
    presentationTitle: sort === "title" ? ("asc" as const) : undefined,
    createdAt: sort === "price" || sort === "title" ? undefined : ("desc" as const),
  };
}
