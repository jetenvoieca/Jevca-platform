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

export async function createPage(
  siteId: string,
  type: "SECTION" | "PRIVATE",
  formData: FormData
) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;

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

export async function saveDraftBlocks(pageId: string, blocks: unknown) {
  const page = await db.page.update({
    where: { id: pageId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { draftBlocks: blocks as any },
  });
  revalidatePath(`/sites/${page.siteId}/pages/${pageId}`);
  return { ok: true };
}

export async function publishSite(siteId: string) {
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
  return { ok: true, count: pages.length };
}
