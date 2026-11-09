"use server";

import { requireAdmin, requireUser } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { cleanThemeEntries, type SiteThemeEntry, type SiteThemeSummary } from "@/lib/siteThemes";
import { DEFAULT_CONTACT_PANEL } from "@/lib/contactPanel";
import { normalizeLayout, type LayoutBlock } from "@/lib/pageStyleLayout";
import { contentFits } from "@/lib/pageComponents";
import { writePageStories } from "@/lib/pageStories";
import { ensureFixedEntries, FIXED_ENTRIES } from "@/lib/profileCatalogue";
import { uniquePageSlug } from "@/lib/pageSlugs";

// Site Themes (2026-11-03) — see lib/siteThemes.ts. Managed by admins
// under Templates → Site Themes; applied to a site from its Pages page.

type Result = { ok: true } | { error: string };

const SELECT = { id: true, name: true, siteMenuStyleId: true, entries: true } as const;

function toSummary(row: { id: string; name: string; siteMenuStyleId: string | null; entries: unknown }): SiteThemeSummary {
  return { ...row, entries: cleanThemeEntries(row.entries) };
}

export async function listSiteThemes(): Promise<SiteThemeSummary[]> {
  await requireUser();
  const rows = await db.siteTheme.findMany({ orderBy: { name: "asc" }, select: SELECT });
  return rows.map(toSummary);
}

export async function createSiteTheme(nameRaw: string): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const name = nameRaw.trim();
  if (!name) return { error: "Give the theme a name." };
  if (await db.siteTheme.findUnique({ where: { name }, select: { id: true } })) {
    return { error: "There's already a theme with that name." };
  }
  const created = await db.siteTheme.create({ data: { name }, select: { id: true } });
  return created;
}

export async function updateSiteTheme(
  id: string,
  input: { name: string; siteMenuStyleId: string | null; entries: SiteThemeEntry[] },
): Promise<Result> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "Give the theme a name." };
  const clash = await db.siteTheme.findFirst({ where: { name, id: { not: id } }, select: { id: true } });
  if (clash) return { error: "There's already a theme with that name." };
  const menu = input.siteMenuStyleId
    ? await db.menuStyle.findUnique({ where: { id: input.siteMenuStyleId }, select: { id: true } })
    : null;
  const { count } = await db.siteTheme.updateMany({
    where: { id },
    data: { name, siteMenuStyleId: menu?.id ?? null, entries: cleanThemeEntries(input.entries) },
  });
  if (count === 0) return { error: "Theme not found." };
  return { ok: true };
}

// The themes a site's Theme icon offers (2026-11-09): with a Plan, those
// it allows (in its order); without one, every theme.
export async function listSiteThemesForSite(siteId: string): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      plan: { select: { themes: { orderBy: { position: "asc" }, select: { siteTheme: { select: { id: true, name: true } } } } } },
    },
  });
  if (site?.plan) return site.plan.themes.map((t) => t.siteTheme);
  return db.siteTheme.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function deleteSiteTheme(id: string): Promise<void> {
  await requireAdmin();
  await db.siteTheme.deleteMany({ where: { id } });
}

// Makes a theme's pages on a site, straight into Live Pages after its
// others, in the theme's order — leaving out any page whose name the site
// already has (it stands in for the theme's page, e.g. as the page others
// sit under), and the Contact panel page if the site has one. Each new
// page is filled where it can be: a curation's page with its works (in
// its first component that takes them), a Profile stories component with
// the Artist Statement, Biography / CV and Galleries. Sets the theme's
// menu as the site's if it has none. A site with a Plan (2026-11-09) may
// only use a theme the Plan allows, and the one applied becomes its
// theme (Site.siteThemeId). Says how many pages were made and left out.
export async function applySiteTheme(
  siteId: string,
  themeId: string,
): Promise<{ created: number; skipped: number } | { error: string }> {
  await requireAdmin();
  const [site, theme] = await Promise.all([
    db.site.findUnique({
      where: { id: siteId },
      select: {
        artistId: true,
        menuStyleId: true,
        plan: { select: { themes: { select: { siteThemeId: true } } } },
      },
    }),
    db.siteTheme.findUnique({ where: { id: themeId }, select: SELECT }),
  ]);
  if (!site) return { error: "Site not found." };
  if (!theme) return { error: "Theme not found." };
  if (site.plan && !site.plan.themes.some((t) => t.siteThemeId === themeId)) {
    return { error: "This site's plan doesn't allow that theme." };
  }
  const entries = cleanThemeEntries(theme.entries);

  const [pages, curations, styles, menus] = await Promise.all([
    db.page.findMany({ where: { siteId }, select: { id: true, title: true, position: true, contactPanel: true, parentId: true } }),
    db.curation.findMany({ where: { artistId: site.artistId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.pageStyle.findMany({ select: { id: true, type: true, layout: true } }),
    db.menuStyle.findMany({ select: { id: true } }),
  ]);
  const byTitle = new Map(pages.map((p) => [p.title.trim().toLowerCase(), p.id]));
  const hasContactPanel = pages.some((p) => p.contactPanel !== null);
  // Pages at the top of the menu — the only ones a page can sit under.
  const topLevel = new Set(pages.filter((p) => !p.parentId).map((p) => p.id));
  const menuIds = new Set(menus.map((m) => m.id));
  const styleById = new Map(styles.map((s) => [s.id, s]));
  let position = pages.reduce((max, p) => Math.max(max, p.position), -1) + 1;

  // The Profile Catalogue's fixed entries, for Profile stories.
  await ensureFixedEntries(site.artistId);
  const fixed = await db.profileStory.findMany({
    where: { artistId: site.artistId, kind: { not: "STORY" } },
    select: { id: true, kind: true },
  });
  const profileStories = FIXED_ENTRIES.flatMap((f) => {
    const found = fixed.find((e) => e.kind === f.kind);
    return found ? [{ id: found.id, swap: false }] : [];
  });

  // What fills a new page's components.
  const fills = (styleId: string | null, curationId: string | null) => {
    const style = styleId ? styleById.get(styleId) : undefined;
    if (style?.type !== "BLOCK_BUILD") return [];
    const normal = normalizeLayout("BLOCK_BUILD", style.layout);
    const blocks: LayoutBlock[] = normal.type === "BLOCK_BUILD" ? normal.layout.blocks : [];
    const out: { blockId: string; source: "WORKS" | "TYPED"; text: string | null }[] = [];
    const worksBlock = curationId ? blocks.find((b) => contentFits(b.type, "WORKS")) : undefined;
    if (worksBlock) out.push({ blockId: worksBlock.id, source: "WORKS", text: null });
    for (const b of blocks) {
      if (b.type === "stories") out.push({ blockId: b.id, source: "TYPED", text: writePageStories(profileStories) });
    }
    return out;
  };

  let created = 0;
  let skipped = 0;
  const pageOfEntry = new Map<string, string>();
  const makePage = async (
    title: string,
    entry: SiteThemeEntry,
    extra: { curationId?: string; contactPanel?: boolean },
  ): Promise<void> => {
    const known = byTitle.get(title.trim().toLowerCase());
    if (known) {
      pageOfEntry.set(entry.id, known);
      skipped++;
      return;
    }
    const pageStyleId = entry.pageStyleId && styleById.has(entry.pageStyleId) ? entry.pageStyleId : null;
    const parent = entry.parentEntryId ? pageOfEntry.get(entry.parentEntryId) : undefined;
    const parentId = parent && topLevel.has(parent) ? parent : null;
    const curationId = extra.curationId ?? null;
    const page = await db.page.create({
      data: {
        siteId,
        title,
        slug: await uniquePageSlug(siteId, title),
        visible: true,
        position: position++,
        curationId,
        pageStyleId: extra.contactPanel ? null : pageStyleId,
        menuStyleId: entry.menuStyleId && menuIds.has(entry.menuStyleId) ? entry.menuStyleId : null,
        parentId,
        contactPanel: extra.contactPanel ? DEFAULT_CONTACT_PANEL : Prisma.DbNull,
        componentContents: {
          create: extra.contactPanel
            ? []
            : fills(pageStyleId, curationId).map((f) => ({ ...f, sectionId: null, hiddenIds: [], orderIds: [] })),
        },
      },
      select: { id: true },
    });
    byTitle.set(title.trim().toLowerCase(), page.id);
    if (!parentId) topLevel.add(page.id);
    pageOfEntry.set(entry.id, page.id);
    created++;
  };

  for (const entry of entries) {
    if (entry.kind === "PAGE") {
      await makePage(entry.title, entry, {});
    } else if (entry.kind === "CURATIONS") {
      for (const c of curations) await makePage(c.name, entry, { curationId: c.id });
    } else if (hasContactPanel) {
      skipped++;
    } else {
      await makePage(entry.title, entry, { contactPanel: true });
    }
  }

  const menuStyleId = !site.menuStyleId && theme.siteMenuStyleId ? theme.siteMenuStyleId : undefined;
  const siteThemeId = site.plan ? themeId : undefined;
  if (menuStyleId || siteThemeId) {
    await db.site.update({ where: { id: siteId }, data: { menuStyleId, siteThemeId } });
  }
  return { created, skipped };
}
