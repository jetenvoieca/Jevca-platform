import { db } from "@/lib/db";

// The Profile Catalogue's fixed entries (2026-11-02; Galleries
// 2026-11-03) — see ProfileStory in schema.prisma. Plain server code, not
// "use server", so the checked actions (lib/actions/profileStories.ts) and
// the importer's token-checked route (/api/hopper/profile-import) share it
// without it becoming an unchecked action.

export type ProfileStoryKind = "STORY" | "STATEMENT" | "BIOGRAPHY" | "GALLERIES";

// The entries every artist has, first in the catalogue, in this order,
// named by their kind.
export const FIXED_ENTRIES: { kind: Exclude<ProfileStoryKind, "STORY">; caption: string }[] = [
  { kind: "STATEMENT", caption: "Artist Statement" },
  { kind: "BIOGRAPHY", caption: "Biography / CV" },
  { kind: "GALLERIES", caption: "Galleries" },
];

// Makes any of the artist's fixed entries they don't have yet, empty.
export async function ensureFixedEntries(artistId: string): Promise<void> {
  const have = await db.profileStory.findMany({
    where: { artistId, kind: { not: "STORY" } },
    select: { kind: true },
  });
  const missing = FIXED_ENTRIES.filter((f) => !have.some((h) => h.kind === f.kind));
  if (missing.length) {
    await db.profileStory.createMany({
      data: missing.map((f) => ({ artistId, kind: f.kind, caption: f.caption, position: 0 })),
    });
  }
}
