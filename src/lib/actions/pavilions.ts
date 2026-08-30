"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/pageSlug";
import { uniqueSlug } from "./pages";

// Creates one Pavilion card's real child Page (2026-08-30). The card
// itself isn't persisted here: PavilionEditor holds the cards array as
// its own state and saves the whole array via the existing
// saveDraftBlocks, the same "generic autosave, page-type-specific shape"
// pattern already used for Section pages (see SectionContent in
// lib/blocks.ts) — this action only does the one part that MUST happen
// server-side and can't simply be optimistic client state: creating the
// real child Page.
export async function createPavilionChildPage(
  siteId: string,
  name: string
): Promise<{ id: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const baseSlug = slugify(trimmed);
  const slug = await uniqueSlug(siteId, baseSlug);
  const maxPosition = await db.page.aggregate({
    where: { siteId },
    _max: { position: true },
  });

  const childPage = await db.page.create({
    data: {
      siteId,
      type: "PRIVATE",
      title: trimmed,
      slug,
      position: (maxPosition._max.position ?? -1) + 1,
      // Keeps this out of the main site nav sidebar (SiteLayout filters
      // on this) so adding several Pavilions doesn't clutter it with an
      // extra entry per one — it still behaves as a completely normal
      // Page everywhere else: selectable in Menu Builder if you want to
      // add it to a menu by hand, and openable directly to fill in with
      // real content later.
      sourceTag: "pavilion",
    },
  });

  return { id: childPage.id };
}

// Keeps a Pavilion card's child Page in sync when the card is renamed —
// same rename mechanism as any other page (updatePageTitle), just called
// from here so PavilionEditor doesn't need to reach into pages.ts
// directly for something that's really "part of saving this card".
export async function renamePavilionChildPage(childPageId: string, siteId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.page.update({ where: { id: childPageId }, data: { title: trimmed } });
  revalidatePath(`/sites/${siteId}`);
}

// Removing a card also removes its child Page — mirrors deletePage's own
// cleanup (any Menu placements first, same transaction) but without its
// redirect, since this is called from inside the Pavilions page's own
// editor rather than a standalone page-delete flow.
export async function deletePavilionChildPage(childPageId: string, siteId: string) {
  await db.$transaction([
    db.menuItem.deleteMany({ where: { pageId: childPageId } }),
    db.page.delete({ where: { id: childPageId } }),
  ]);
  revalidatePath(`/sites/${siteId}`);
}
