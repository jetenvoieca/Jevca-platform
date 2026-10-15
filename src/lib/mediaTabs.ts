// The Media Catalogue's views (2026-10-15): Artworks (the catalogue's
// works, read only), Marketing (pictures not tied to an artwork), Videos
// (videos not tied to an artwork) and Related (anything tied to an
// artwork, apart from its Main image). Plain module.
export type MediaTab = "artworks" | "marketing" | "videos" | "related";

export function readMediaTab(value: string | undefined): MediaTab {
  return value === "artworks" || value === "videos" || value === "related" ? value : "marketing";
}

// What listMedia is asked for, for a media view.
export function mediaListFilters(tab: Exclude<MediaTab, "artworks">): {
  purpose: "marketing" | "related";
  kind?: "PHOTO" | "VIDEO";
} {
  if (tab === "related") return { purpose: "related" };
  return { purpose: "marketing", kind: tab === "videos" ? "VIDEO" : "PHOTO" };
}
