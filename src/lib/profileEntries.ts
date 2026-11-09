// The Profile Catalogue's kinds of entry and its fixed entries
// (2026-11-02; Galleries 2026-11-03) — see ProfileStory in schema.prisma.
// No database here, so the screens can use it too (2026-11-09); the
// server code is in lib/profileCatalogue.ts.

export type ProfileStoryKind = "STORY" | "STATEMENT" | "BIOGRAPHY" | "GALLERIES";
export type FixedKind = Exclude<ProfileStoryKind, "STORY">;

// The entries every artist has, first in the catalogue, in this order,
// named by their kind.
export const FIXED_ENTRIES: { kind: FixedKind; caption: string }[] = [
  { kind: "STATEMENT", caption: "Artist Statement" },
  { kind: "BIOGRAPHY", caption: "Biography / CV" },
  { kind: "GALLERIES", caption: "Galleries" },
];
