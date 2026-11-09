import { db } from "@/lib/db";
import { FIXED_ENTRIES, type FixedKind } from "@/lib/profileEntries";

// The Profile Catalogue's fixed entries (2026-11-02; Galleries
// 2026-11-03) — see ProfileStory in schema.prisma and
// lib/profileEntries.ts (which they are). Plain server code, not
// "use server", so the checked actions (lib/actions/profileStories.ts) and
// the importer's token-checked route (/api/hopper/profile-import) share it
// without it becoming an unchecked action.

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

// Clears the catalogue (2026-11-09, Craig's request — Clear all in the
// Profile Catalogue and the Artist App's Update CV; also the site's
// Delete all): the chosen fixed entries emptied — text, picture and
// galleries, so they no longer show on a page — and, if chosen, every
// story deleted. Pictures and videos stay in the Media Catalogue. Returns
// how many stories were deleted. Unchecked: callers check access.
export async function clearProfileEntries(
  artistId: string,
  choice: { fixed: FixedKind[]; stories: boolean }
): Promise<number> {
  const fixed = FIXED_ENTRIES.map((f) => f.kind).filter((k) => choice.fixed.includes(k));
  return db.$transaction(async (tx) => {
    if (fixed.length) {
      await tx.profileGallery.deleteMany({ where: { story: { artistId, kind: { in: fixed } } } });
      await tx.profileStory.updateMany({
        where: { artistId, kind: { in: fixed } },
        data: { story: "", imageId: null },
      });
    }
    if (!choice.stories) return 0;
    return (await tx.profileStory.deleteMany({ where: { artistId, kind: "STORY" } })).count;
  });
}
