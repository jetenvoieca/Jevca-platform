"use server";

import { requireAdmin, requireUser } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { cleanThemeEntries, type SiteThemeEntry, type SiteThemeSummary } from "@/lib/siteThemes";
import { applyThemeToSite, SITE_THEME_SELECT } from "@/lib/siteThemeApply";

// Site Themes (2026-11-03) — see lib/siteThemes.ts. Managed by admins
// under Templates → Site Themes; applied to a site from its Pages page.

type Result = { ok: true } | { error: string };

function toSummary(row: { id: string; name: string; siteMenuStyleId: string | null; entries: unknown }): SiteThemeSummary {
  return { ...row, entries: cleanThemeEntries(row.entries) };
}

export async function listSiteThemes(): Promise<SiteThemeSummary[]> {
  await requireUser();
  const rows = await db.siteTheme.findMany({ orderBy: { name: "asc" }, select: SITE_THEME_SELECT });
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

// The Theme icon on a site's Pages page (admin only) — see
// applyThemeToSite in lib/siteThemeApply.ts.
export async function applySiteTheme(
  siteId: string,
  themeId: string,
): Promise<{ created: number; skipped: number } | { error: string }> {
  await requireAdmin();
  return applyThemeToSite(siteId, themeId);
}
