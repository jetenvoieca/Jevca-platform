"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// The business's own website, jetenvoieca.com (2026-09-29) — platform-
// level, not tied to any Artist or Site. Edits go live on save (no
// draft/publish, direct decision). See WebsiteHome / WebsitePage /
// WebsiteMenuItem in schema.prisma.

export type WebsitePageSummary = {
  id: string;
  name: string;
};

// Turns a page name into a web address segment, e.g. "Artists" ->
// "artists". Falls back to "page" if nothing usable is left.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

// Adds -2, -3, ... until the slug isn't used by another page.
async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (
    await db.websitePage.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export async function listWebsitePages(): Promise<WebsitePageSummary[]> {
  return db.websitePage.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
}

// "+ Add content page" — creates an empty page at the end of the list.
export async function createWebsitePage(): Promise<{ id: string }> {
  const name = "New page";
  const highest = await db.websitePage.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const page = await db.websitePage.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      position: (highest?.position ?? -1) + 1,
    },
    select: { id: true },
  });

  revalidatePath("/accounts/website", "layout");
  return page;
}
