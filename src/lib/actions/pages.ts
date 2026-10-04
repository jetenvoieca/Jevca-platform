"use server";

import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/pageSlug";

// Deliberately NOT calling revalidatePath(`/sites/${siteId}`) from the
// actions below (2026-08-31 removal) — the same fix already made in
// lib/actions/hopper.ts and lib/actions/artworks.ts, applied here too.
// /sites/[id] is already force-dynamic (never statically cached, so
// there's nothing for revalidatePath to usefully invalidate), and
// calling it on a route currently being viewed triggers Next's automatic
// full refresh of that route regardless of any explicit client-side
// router.refresh() — proven elsewhere in this project to be both
// unnecessary and, in at least one case, actively harmful (it wiped
// in-progress input in the Hopper's "Add Artwork" flow). Every caller of
// these actions already refreshes what it needs itself (router.refresh(),
// or a redirect() to a fresh page). publishSite is invoked as a native
// form action, which Next refreshes automatically on completion without
// any revalidatePath needed.

// Kept as an export here (async, so valid alongside the other Server
// Actions in this file) rather than moving to pageSlug.ts alongside
// slugify — this one needs `db`, so it stays server-only regardless.
export async function uniqueSlug(siteId: string, base: string) {
  let slug = base;
  let n = 2;
  while (await db.page.findFirst({ where: { siteId, slug } })) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

// What the Pages page's Add / Edit modal saves (2026-10-04). Display
// Style is a placeholder for now, so it isn't saved yet.
export type PageDetailsInput = { title: string; curationId: string | null };

// A page can only show one of its own site's artist's curations —
// anything else is treated as no curation.
async function ownCurationId(siteId: string, curationId: string | null): Promise<string | null> {
  if (!curationId) return null;
  const curation = await db.curation.findFirst({
    where: { id: curationId, artist: { sites: { some: { id: siteId } } } },
    select: { id: true },
  });
  return curation?.id ?? null;
}

// Add (2026-10-04). A new page starts in Hidden Pages, at the bottom, so
// nothing appears on the site until it's dragged into Live Pages.
export async function createPage(
  siteId: string,
  input: PageDetailsInput
): Promise<{ id: string } | { error: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Give the page a name." };

  const [slug, curationId, last] = await Promise.all([
    uniqueSlug(siteId, slugify(title)),
    ownCurationId(siteId, input.curationId),
    db.page.aggregate({ where: { siteId }, _max: { position: true } }),
  ]);

  const page = await db.page.create({
    data: {
      siteId,
      title,
      slug,
      curationId,
      visible: false,
      position: (last._max.position ?? -1) + 1,
    },
    select: { id: true },
  });
  return { id: page.id };
}

// Edit (2026-10-04). Renaming leaves the slug alone, same as
// updatePageTitle below.
export async function updatePageDetails(
  siteId: string,
  pageId: string,
  input: PageDetailsInput
): Promise<{ ok: true } | { error: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Give the page a name." };

  const curationId = await ownCurationId(siteId, input.curationId);
  await db.page.updateMany({ where: { id: pageId, siteId }, data: { title, curationId } });
  return { ok: true };
}

// Saves the Pages page's two lists in one go after a drag (2026-10-04):
// Live pages first, then Hidden, each in the order shown. Position is
// numbered straight through both lists, and `visible` follows which list
// a page is in. Scoped by siteId so an id from another site is ignored.
export async function reorderPages(
  siteId: string,
  liveIds: string[],
  hiddenIds: string[]
): Promise<void> {
  const ordered = [
    ...liveIds.map((id) => ({ id, visible: true })),
    ...hiddenIds.map((id) => ({ id, visible: false })),
  ];
  await db.$transaction(
    ordered.map((p, position) =>
      db.page.updateMany({
        where: { id: p.id, siteId },
        data: { visible: p.visible, position },
      })
    )
  );
}

// Renaming deliberately leaves the slug untouched — changing it would break
// any existing links pointing at this page's URL.
export async function updatePageTitle(
  pageId: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  await db.page.update({ where: { id: pageId }, data: { title } });
}

// Scoped by siteId, so a page can only be deleted from its own site.
export async function deletePage(siteId: string, pageId: string) {
  await db.page.deleteMany({ where: { id: pageId, siteId } });
  redirect(`/sites/${siteId}/pages`);
}

export async function saveDraftBlocks(pageId: string, blocks: unknown) {
  const page = await db.page.update({
    where: { id: pageId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { draftBlocks: blocks as any },
  });
  return { ok: true };
}

// Page-level background styling (2026-09-03) — deliberately separate
// from saveDraftBlocks above: backgroundColor/backgroundImageId are
// real columns on Page, not part of the draftBlocks/liveBlocks content
// JSON (see the note on those columns in schema.prisma), so this is its
// own small action rather than being folded into the blocks payload.
// Either value can be explicitly set to null to clear it (e.g. removing
// a background image while leaving the colour as is).
export async function updatePageBackground(
  pageId: string,
  data: { backgroundColor?: string | null; backgroundImageId?: string | null }
) {
  await db.page.update({
    where: { id: pageId },
    data: {
      ...(data.backgroundColor !== undefined && { backgroundColor: data.backgroundColor }),
      ...(data.backgroundImageId !== undefined && { backgroundImageId: data.backgroundImageId }),
    },
  });
  return { ok: true };
}

export async function publishSite(siteId: string): Promise<void> {
  const pages = await db.page.findMany({ where: { siteId } });

  await db.$transaction(
    pages.map((p) =>
      db.page.update({
        where: { id: p.id },
        data: { liveBlocks: p.draftBlocks as object },
      })
    )
  );
}
