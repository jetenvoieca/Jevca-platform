"use server";

import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getPresignedUploadUrl } from "@/lib/r2";
import { revalidatePath } from "next/cache";

// The business's own website, jetenvoieca.com (2026-09-29) — platform-
// level, not tied to any Artist or Site. Edits go live on save (no
// draft/publish, direct decision). See WebsiteHome / WebsitePage /
// WebsiteMenuItem in schema.prisma.

export type WebsitePageSummary = {
  id: string;
  name: string;
  slug: string;
};

export type WebsitePageData = {
  id: string;
  name: string;
  slug: string;
  title: string;
  caption: string;
  text: string;
};

export type WebsiteHomeData = {
  imageUrl: string | null;
  wordmark: string;
  email: string | null;
};

export type WebsiteMenuItemData = {
  id: string;
  label: string;
  text: string;
  hoverText: string;
  pageId: string | null;
};

const HOME_ID = "singleton";
const DEFAULT_WORDMARK = "JETENVOIECA";

function revalidateWebsite() {
  revalidatePath("/accounts/website", "layout");
}

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

// For new pages only: adds -2, -3, ... until the slug isn't in use.
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (await db.websitePage.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

// ---- Content pages ------------------------------------------------

export async function listWebsitePages(): Promise<WebsitePageSummary[]> {
  return db.websitePage.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function getWebsitePage(id: string): Promise<WebsitePageData | null> {
  return db.websitePage.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, title: true, caption: true, text: true },
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

  revalidateWebsite();
  return page;
}

// Saves every field of a content page. The web address is cleaned up
// (e.g. "Our Artists!" -> "our-artists"), taken from the name if left
// blank, and refused if another page already uses it. Returns the
// address actually saved.
export async function updateWebsitePage(
  id: string,
  data: Omit<WebsitePageData, "id">
): Promise<{ slug: string } | { error: string }> {
  const name = data.name.trim();
  if (!name) return { error: "Page name is required." };

  const slug = slugify(data.slug.trim() || name);
  const clash = await db.websitePage.findFirst({
    where: { slug, id: { not: id } },
    select: { id: true },
  });
  if (clash) return { error: `jetenvoieca.com/${slug} is already used by another page.` };

  await db.websitePage.update({
    where: { id },
    data: { name, slug, title: data.title, caption: data.caption, text: data.text },
  });

  revalidateWebsite();
  return { slug };
}

// Any Home menu item pointing at this page keeps its text but loses its
// link (onDelete: SetNull in schema.prisma).
export async function deleteWebsitePage(id: string): Promise<void> {
  await db.websitePage.delete({ where: { id } });
  revalidateWebsite();
}

// ---- Home page ----------------------------------------------------

// The row is only created on first save, so a fresh install reads the
// defaults here.
export async function getWebsiteHome(): Promise<WebsiteHomeData> {
  const row = await db.websiteHome.findUnique({ where: { id: HOME_ID } });
  return {
    imageUrl: row?.imageUrl ?? null,
    wordmark: row?.wordmark ?? DEFAULT_WORDMARK,
    email: row?.email ?? null,
  };
}

export async function updateWebsiteHome(data: WebsiteHomeData): Promise<void> {
  const values = {
    imageUrl: data.imageUrl,
    wordmark: data.wordmark.trim(),
    email: data.email?.trim() || null,
  };
  await db.websiteHome.upsert({
    where: { id: HOME_ID },
    create: { id: HOME_ID, ...values },
    update: values,
  });
  revalidateWebsite();
}

// Direct-to-R2 upload for the Home image — same presigned-URL mechanism
// as Guides (requestGuideImageUploadUrl), keyed under "website/". Not an
// Image row: Image belongs to an Artist's Media Catalogue.
export async function requestWebsiteImageUploadUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; url: string } | { error: string }> {
  if (!contentType.startsWith("image/")) {
    return { error: "Only images can be uploaded." };
  }
  const key = `website/${randomUUID()}-${sanitizeFilename(filename)}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return { uploadUrl, url: `/api/media/${key}` };
}

// ---- Home menu items ----------------------------------------------

const menuItemSelect = {
  id: true,
  label: true,
  text: true,
  hoverText: true,
  pageId: true,
} as const;

export async function listWebsiteMenuItems(): Promise<WebsiteMenuItemData[]> {
  return db.websiteMenuItem.findMany({
    orderBy: { position: "asc" },
    select: menuItemSelect,
  });
}

// "Add" — an empty item at the end of the menu.
export async function createWebsiteMenuItem(): Promise<WebsiteMenuItemData> {
  const highest = await db.websiteMenuItem.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const item = await db.websiteMenuItem.create({
    data: { position: (highest?.position ?? -1) + 1 },
    select: menuItemSelect,
  });
  revalidateWebsite();
  return item;
}

export async function updateWebsiteMenuItem(
  id: string,
  data: Omit<WebsiteMenuItemData, "id">
): Promise<void> {
  await db.websiteMenuItem.update({
    where: { id },
    data: {
      label: data.label,
      text: data.text,
      hoverText: data.hoverText,
      pageId: data.pageId,
    },
  });
  revalidateWebsite();
}

export async function deleteWebsiteMenuItem(id: string): Promise<void> {
  await db.websiteMenuItem.delete({ where: { id } });
  revalidateWebsite();
}

// Saves the whole menu order at once, after a drag.
export async function reorderWebsiteMenuItems(orderedIds: string[]): Promise<void> {
  await db.$transaction(
    orderedIds.map((id, position) =>
      db.websiteMenuItem.update({ where: { id }, data: { position } })
    )
  );
  revalidateWebsite();
}
