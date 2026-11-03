"use server";

import { requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { slugify } from "@/lib/pageSlug";
import type { HeadingNames } from "@/lib/pageHeading";
import { Prisma } from "@/generated/prisma/client";
import { readContactPanel, type ContactPanelSettings } from "@/lib/contactPanel";

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
// or a redirect() to a fresh page).
//
// Publishing a site lives in lib/actions/siteSnapshot.ts (2026-10-06).

// The page's web address: its name as a slug, with -2, -3… added if
// another page on the site already has it. Not exported, so it isn't
// callable from the browser.
async function uniqueSlug(siteId: string, base: string) {
  let slug = base;
  let n = 2;
  while (await db.page.findFirst({ where: { siteId, slug } })) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

// What the Pages page's Add / Edit modal saves (2026-10-04): name,
// curation, Display Style (a Page Style, 2026-10-05), Menu (a Menu
// Style, 2026-10-06 — null = the site's menu), the page it sits under
// in the menu (2026-10-25 — null = at the top) and, for a Contact panel
// page (2026-11-03 — see lib/contactPanel.ts), the panel's settings
// (null = an ordinary page).
export type PageDetailsInput = {
  title: string;
  curationId: string | null;
  pageStyleId: string | null;
  menuStyleId: string | null;
  parentId: string | null;
  contactPanel: ContactPanelSettings | null;
};

// A Contact panel page's settings, checked: one such page a site.
async function checkedContactPanel(
  siteId: string,
  pageId: string | null,
  raw: unknown,
): Promise<{ contactPanel: ContactPanelSettings | null } | { error: string }> {
  const contactPanel = readContactPanel(raw);
  if (!contactPanel) return { contactPanel: null };
  const other = await db.page.findFirst({
    where: { siteId, NOT: { contactPanel: { equals: Prisma.DbNull } }, ...(pageId ? { id: { not: pageId } } : {}) },
    select: { title: true },
  });
  if (other) return { error: `"${other.title}" is already this site's Contact panel page.` };
  return { contactPanel };
}

// The page another sits under (2026-10-25): one of the same site's pages
// at the top of the menu, not the page itself. One level only, so a page
// with pages under it stays at the top.
async function checkedParentId(
  siteId: string,
  pageId: string | null,
  parentId: string | null,
): Promise<{ parentId: string | null } | { error: string }> {
  if (!parentId) return { parentId: null };
  if (parentId === pageId) return { error: "A page can't sit under itself." };
  const parent = await db.page.findFirst({ where: { id: parentId, siteId }, select: { parentId: true } });
  if (!parent) return { parentId: null };
  if (parent.parentId) return { error: "That page sits under another page itself — choose a page at the top." };
  if (pageId && (await db.page.count({ where: { parentId: pageId } })) > 0) {
    return { error: "This page has pages under it, so it stays at the top." };
  }
  return { parentId };
}

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

// Page Styles are shared by every site, so any existing style is
// allowed — an unknown id is treated as no style.
async function existingPageStyleId(pageStyleId: string | null): Promise<string | null> {
  if (!pageStyleId) return null;
  const style = await db.pageStyle.findUnique({
    where: { id: pageStyleId },
    select: { id: true },
  });
  return style?.id ?? null;
}

// Menu Styles are shared by every site too — an unknown id is treated
// as none (the site's menu).
async function existingMenuStyleId(menuStyleId: string | null): Promise<string | null> {
  if (!menuStyleId) return null;
  const style = await db.menuStyle.findUnique({
    where: { id: menuStyleId },
    select: { id: true },
  });
  return style?.id ?? null;
}

// The site's menu (2026-10-06), chosen under Live Pages on the Pages
// page — null = no menu chosen yet.
export async function updateSiteMenuStyle(siteId: string, menuStyleId: string | null) {
  await requireSiteAccess(siteId);
  await db.site.update({
    where: { id: siteId },
    data: { menuStyleId: await existingMenuStyleId(menuStyleId) },
  });
}

// Add (2026-10-04). A new page starts in Hidden Pages, at the bottom, so
// nothing appears on the site until it's dragged into Live Pages.
export async function createPage(siteId: string, input: PageDetailsInput): Promise<{ id: string } | { error: string }> {
  await requireSiteAccess(siteId);
  const title = input.title.trim();
  if (!title) return { error: "Give the page a name." };

  const [slug, curationId, pageStyleId, menuStyleId, parent, panel, last] = await Promise.all([
    uniqueSlug(siteId, slugify(title)),
    ownCurationId(siteId, input.curationId),
    existingPageStyleId(input.pageStyleId),
    existingMenuStyleId(input.menuStyleId),
    checkedParentId(siteId, null, input.parentId),
    checkedContactPanel(siteId, null, input.contactPanel),
    db.page.aggregate({ where: { siteId }, _max: { position: true } }),
  ]);
  if ("error" in parent) return parent;
  if ("error" in panel) return panel;
  // A Contact panel page has no content of its own.
  const own = !panel.contactPanel;

  const page = await db.page.create({
    data: {
      siteId,
      title,
      slug,
      curationId: own ? curationId : null,
      pageStyleId: own ? pageStyleId : null,
      menuStyleId,
      parentId: parent.parentId,
      contactPanel: panel.contactPanel ?? Prisma.DbNull,
      visible: false,
      position: (last._max.position ?? -1) + 1,
    },
    select: { id: true },
  });
  return { id: page.id };
}

// Edit (2026-10-04). Renaming leaves the slug alone, so links to the
// page keep working. What fills the page's components (2026-10-07,
// see PageComponentContent) belongs to its Display Style's components
// and its curation's sections, so it goes when they change: all of it
// with a new style, and the sections (not the works) with a new
// curation. Its sign-up forms (2026-10-10) belong to the style's
// components, so they go with a new style.
export async function updatePageDetails(
  siteId: string,
  pageId: string,
  input: PageDetailsInput,
): Promise<{ ok: true } | { error: string }> {
  await requireSiteAccess(siteId);
  const title = input.title.trim();
  if (!title) return { error: "Give the page a name." };

  const current = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyleId: true },
  });
  if (!current) return { error: "Page not found." };

  const [checkedCurationId, checkedStyleId, menuStyleId, parent, panel] = await Promise.all([
    ownCurationId(siteId, input.curationId),
    existingPageStyleId(input.pageStyleId),
    existingMenuStyleId(input.menuStyleId),
    checkedParentId(siteId, pageId, input.parentId),
    checkedContactPanel(siteId, pageId, input.contactPanel),
  ]);
  if ("error" in parent) return parent;
  if ("error" in panel) return panel;
  // A Contact panel page has no content of its own.
  const curationId = panel.contactPanel ? null : checkedCurationId;
  const pageStyleId = panel.contactPanel ? null : checkedStyleId;

  // A new Display Style clears every component's content; a new curation
  // only what was the old curation's (see curationChangeClears).
  const styleChanged = current.pageStyleId !== pageStyleId;
  const curationChanged = current.curationId !== curationId;
  const clearComponents = styleChanged
    ? [db.pageComponentContent.deleteMany({ where: { pageId } })]
    : curationChanged
      ? curationChangeClears(pageId)
      : [];

  await db.$transaction([
    db.page.update({
      where: { id: pageId },
      data: {
        title,
        curationId,
        pageStyleId,
        menuStyleId,
        parentId: parent.parentId,
        contactPanel: panel.contactPanel ?? Prisma.DbNull,
      },
    }),
    ...clearComponents,
    ...(styleChanged ? [db.pageSignupForm.deleteMany({ where: { pageId } })] : []),
  ]);
  return { ok: true };
}

// What a page's new curation clears (2026-10-13): its sections, and its
// works' choices (removed, order — they were the old curation's works).
// Typed components stay.
function curationChangeClears(pageId: string) {
  return [
    db.pageComponentContent.deleteMany({ where: { pageId, source: "SECTION" } }),
    db.pageComponentContent.updateMany({
      where: { pageId, source: "WORKS" },
      data: { hiddenIds: [], orderIds: [] },
    }),
  ];
}

// Changes just the page's curation (2026-11-01 — Arrange's curation
// chooser), clearing what was the old one's like Edit does.
export async function setPageCuration(
  siteId: string,
  pageId: string,
  curationIdRaw: string | null,
): Promise<{ ok: true } | { error: string }> {
  await requireSiteAccess(siteId);
  const current = await db.page.findFirst({ where: { id: pageId, siteId }, select: { curationId: true } });
  if (!current) return { error: "Page not found." };
  const curationId = await ownCurationId(siteId, curationIdRaw);
  if (current.curationId === curationId) return { ok: true };
  await db.$transaction([
    db.page.update({ where: { id: pageId }, data: { curationId } }),
    ...curationChangeClears(pageId),
  ]);
  return { ok: true };
}

// Saves the Pages page's two lists in one go after a drag (2026-10-04):
// Live pages first, then Hidden, each in the order shown. Position is
// numbered straight through both lists, and `visible` follows which list
// a page is in. Scoped by siteId so an id from another site is ignored.
export async function reorderPages(siteId: string, liveIds: string[], hiddenIds: string[]): Promise<void> {
  await requireSiteAccess(siteId);
  const ordered = [...liveIds.map((id) => ({ id, visible: true })), ...hiddenIds.map((id) => ({ id, visible: false }))];
  await db.$transaction(
    ordered.map((p, position) =>
      db.page.updateMany({
        where: { id: p.id, siteId },
        data: { visible: p.visible, position },
      }),
    ),
  );
}

// Scoped by siteId, so a page can only be deleted from its own site.
export async function deletePage(siteId: string, pageId: string) {
  await requireSiteAccess(siteId);
  await db.page.deleteMany({ where: { id: pageId, siteId } });
  redirect(`/sites/${siteId}/pages`);
}

// What a Page heading is filled in from (2026-10-25 — see
// lib/pageHeading.ts): the site's name, the page's name and the name of
// the page it sits under. Scoped by siteId.
export async function getPageHeadingNames(siteId: string, pageId: string): Promise<HeadingNames | null> {
  await requireSiteAccess(siteId);
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { title: true, site: { select: { name: true } }, parent: { select: { title: true } } },
  });
  if (!page) return null;
  return { siteName: page.site.name, pageTitle: page.title, groupTitle: page.parent?.title ?? null };
}
