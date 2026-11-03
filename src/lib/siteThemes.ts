// Site Themes (2026-11-03, Craig's request — setting up 40+ ISYT sites):
// see SiteTheme in schema.prisma. A theme's entries are the pages a site
// of that theme has, in menu order, each one of:
// - PAGE: a page called `title`, with its Display Style (`pageStyleId`),
//   its own menu (`menuStyleId`, null = the site's) and the page it sits
//   under (`parentEntryId`, another PAGE entry at the top — null = at
//   the top);
// - CURATIONS: a page for each of the artist's curations, named after it
//   and showing it, in that Display Style, under that page;
// - CONTACT: the site's Contact panel page (lib/contactPanel.ts), called
//   `title`.
// Plain module, shared by the actions, Templates → Site Themes and the
// Pages page.

export const SITE_THEME_ENTRY_KINDS = ["PAGE", "CURATIONS", "CONTACT"] as const;
export type SiteThemeEntryKind = (typeof SITE_THEME_ENTRY_KINDS)[number];

export type SiteThemeEntry = {
  id: string;
  kind: SiteThemeEntryKind;
  title: string;
  pageStyleId: string | null;
  menuStyleId: string | null;
  parentEntryId: string | null;
};

export type SiteThemeSummary = {
  id: string;
  name: string;
  siteMenuStyleId: string | null;
  entries: SiteThemeEntry[];
};

export const MAX_THEME_ENTRIES = 50;
export const MAX_THEME_TITLE = 80;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const id = (value: unknown) => (typeof value === "string" && value ? value.slice(0, 100) : null);

// Whatever is stored (or sent), as valid entries: unknown kinds dropped, a
// page with no name dropped, and a page only under a page at the top that
// comes before it.
export function cleanThemeEntries(raw: unknown): SiteThemeEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteThemeEntry[] = [];
  for (const r of raw.slice(0, MAX_THEME_ENTRIES)) {
    const v = (r ?? {}) as Record<string, unknown>;
    const kind = SITE_THEME_ENTRY_KINDS.find((k) => k === v.kind);
    const entryId = id(v.id);
    if (!kind || !entryId || out.some((e) => e.id === entryId)) continue;
    const title = kind === "CURATIONS" ? "" : text(v.title, MAX_THEME_TITLE);
    if (kind !== "CURATIONS" && !title) continue;
    const parent = id(v.parentEntryId);
    const parentOk = parent && out.some((e) => e.id === parent && e.kind === "PAGE" && !e.parentEntryId);
    out.push({
      id: entryId,
      kind,
      title,
      pageStyleId: kind === "CONTACT" ? null : id(v.pageStyleId),
      menuStyleId: id(v.menuStyleId),
      parentEntryId: kind !== "CONTACT" && parentOk ? parent : null,
    });
  }
  return out;
}
