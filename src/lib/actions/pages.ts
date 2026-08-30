"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/pageSlug";

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

  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}/pages/${page.id}`);
}

// The visible toggle lets a page be built/edited in readiness without it
// counting as "ready" — doesn't affect Draft/Publish (that's still about
// content changes), just whether the page is meant to be found/shown yet.
export async function updatePageVisibility(pageId: string, siteId: string, visible: boolean) {
  await db.page.update({ where: { id: pageId }, data: { visible } });
  revalidatePath(`/sites/${siteId}`);
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
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/pages/${pageId}`);
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
  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}`);
}

export async function saveDraftBlocks(pageId: string, blocks: unknown) {
  const page = await db.page.update({
    where: { id: pageId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { draftBlocks: blocks as any },
  });
  revalidatePath(`/sites/${page.siteId}/pages/${pageId}`);
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

  revalidatePath(`/sites/${siteId}`);
}
