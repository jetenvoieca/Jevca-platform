// The Artist App (2026-11-08, Craig's mockups) — the artist's own simple
// screens for managing what is on their site, to replace the Studio app
// in time. Full screen on its own address, /artist-app/<site id>, without
// the admin menu; its buttons are its navigation. Admin only for now
// (its layout refuses anyone else). Its look is shared by its menu item
// in the admin (siteNav.ts) and its screens (components/artist-app).

export const ARTIST_APP_FONT = '"Gill Sans", "Gill Sans MT", Calibri, sans-serif';

// The admin menu item: pale blue with dark grey words.
export const ARTIST_APP_MENU_COLOR = "#CED8F2";
export const ARTIST_APP_MENU_TEXT = "#4A4A4A";

// Hidden for now as an experiment (Craig, 8 Nov) — may come back; set to
// true to show again. Manage Works: its button, and the app starting on
// Arrange Pages instead. Presentation medium: its box on a work's
// Presentation card in the app (the admin keeps it).
export const ARTIST_APP_SHOWS_MANAGE_WORKS = false;
export const ARTIST_APP_SHOWS_PRESENTATION_MEDIUM = false;

// What else the app offers — pictures from the device or the Media
// Catalogue too, the artwork picker's filters, page limits — follows the
// site's Plan and add-ons (2026-11-09): see siteFeatures in lib/plans.ts
// and components/artist-app/ArtistAppFeatures.tsx.

// Its screens: Manage Works (the start), Arrange Pages, Account
// and with Art Manager the Art manager ("artworks") and its Add Artworks.
export function artistAppHref(
  siteId: string,
  screen: "" | "pages" | "account" | "artworks" | "artworks/add" = "",
): string {
  return `/artist-app/${siteId}${screen ? `/${screen}` : ""}`;
}

// Arrange Pages with a page chosen (its `page`), and that page's preview.
export function artistAppPageHref(siteId: string, pageId: string): string {
  return `${artistAppHref(siteId, "pages")}?page=${encodeURIComponent(pageId)}`;
}
export function artistAppPreviewHref(siteId: string, pageId: string): string {
  return `/artist-app/${siteId}/preview/${encodeURIComponent(pageId)}`;
}
