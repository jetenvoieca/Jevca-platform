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
// these actions already refreshes what it needs itself: SiteShell calls
// router.refresh() right after updatePageVisibility and updatePageTitle,
// and createPage/deletePage redirect() to a fresh page anyway. publishSite
// is invoked as a native form action, which Next refreshes automatically
// on completion without any revalidatePath needed.

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

export async function createPage(siteId: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  const typeRaw = formData.get("type");
  const type =
    typeRaw === "PRIVATE"
      ? "PRIVATE"
      : typeRaw === "PAVILION"
        ? "PAVILION"
        : typeRaw === "PAVILION_VISUAL"
          ? "PAVILION_VISUAL"
          : "SECTION";

  const baseSlug = slugify(title);
  const slug = await uniqueSlug(siteId, baseSlug);

  const maxPosition = await db.page.aggregate({
    where: { siteId },
    _max: { position: true },
  });

  const page = await db.page.create({
    data: {
      siteId,
      type,
      title,
      slug,
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });

  redirect(`/sites/${siteId}/pages/${page.id}`);
}

// The visible toggle lets a page be built/edited in readiness without it
// counting as "ready" — doesn't affect Draft/Publish (that's still about
// content changes), just whether the page is meant to be found/shown yet.
export async function updatePageVisibility(pageId: string, siteId: string, visible: boolean) {
  await db.page.update({ where: { id: pageId }, data: { visible } });
}

// Renaming deliberately leaves the slug untouched — changing it would break
// any existing links/menu placements pointing at this page's URL.
export async function updatePageTitle(
  pageId: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  await db.page.update({ where: { id: pageId }, data: { title } });
}

// Used by the delete-confirmation prompt, so it can warn accurately
// ("used in 2 menu placements") rather than a generic guess.
export async function menuItemCountForPage(pageId: string) {
  return db.menuItem.count({ where: { pageId } });
}

// Page has no cascade delete for MenuItems that reference it (a MenuItem's
// own label/byline are independent of the Page, so losing the Page
// shouldn't silently corrupt a saved Menu) — so any placements are removed
// explicitly here, in the same transaction as the Page itself.
export async function deletePage(siteId: string, pageId: string) {
  await db.$transaction([
    db.menuItem.deleteMany({ where: { pageId } }),
    db.page.delete({ where: { id: pageId } }),
  ]);
  redirect(`/sites/${siteId}`);
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
