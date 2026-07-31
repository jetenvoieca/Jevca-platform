"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "page"
  );
}

async function uniqueSlug(siteId: string, base: string) {
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
  const type = formData.get("type") === "PRIVATE" ? "PRIVATE" : "SECTION";

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
