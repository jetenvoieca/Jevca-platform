// Fixed artist -> site mappings for the read-only-menu "preview" mode
// (2026-09-12, evaluation build only — see decisions log). Each entry
// is reachable at /preview/<slug>, showing that one site's own content
// through the artists' version of the nav (see previewNav.ts): just
// Artworks — Catalogue (with its Add Artworks page), Curations and
// Locations.
//
// To make another site reachable the same way later, add another
// "slug": "siteId" entry here — nothing else needs to change.
export const PREVIEW_SITES: Record<string, string> = {
  "louise-dear": "cms4w3loj000209la5nwk9d19",
};

export function resolvePreviewSiteId(slug: string): string | null {
  return PREVIEW_SITES[slug] ?? null;
}
