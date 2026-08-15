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

export function buildArtworkOrderBy(sort?: string) {
  return {
    presentationPrice: sort === "price" ? ("desc" as const) : undefined,
    presentationTitle: sort === "title" ? ("asc" as const) : undefined,
    createdAt: sort === "price" || sort === "title" ? undefined : ("desc" as const),
  };
}
