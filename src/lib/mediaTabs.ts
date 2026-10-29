// The Media Catalogue's views (2026-10-15): Artworks (the catalogue's
// works, read only), Marketing (pictures not tied to an artwork) and
// Videos (videos not tied to an artwork). Related (an artwork's other
// pictures) went 2026-10-28 — an artwork has one picture. Plain module.
export type MediaTab = "artworks" | "marketing" | "videos";

function readMediaTab(value: string | undefined): MediaTab {
  return value === "artworks" || value === "videos" ? value : "marketing";
}

// Every view of the Media Catalogue: the media views, Music and Stickers
// (2026-10-16 — the artist's libraries for Video Edit).
export type CatalogueView = MediaTab | "music" | "stickers";

export function readCatalogueView(value: string | undefined): CatalogueView {
  return value === "music" || value === "stickers" ? value : readMediaTab(value);
}

// What listMedia is asked for, for a media view.
export function mediaListFilters(tab: Exclude<MediaTab, "artworks">): {
  purpose: "marketing";
  kind: "PHOTO" | "VIDEO";
} {
  return { purpose: "marketing", kind: tab === "videos" ? "VIDEO" : "PHOTO" };
}
