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

// Its screens: Manage Works (the start), Arrange Pages and Update CV.
export function artistAppHref(siteId: string, screen: "" | "pages" | "cv" = ""): string {
  return `/artist-app/${siteId}${screen ? `/${screen}` : ""}`;
}
