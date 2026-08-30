export type TextBlock = { id: string; type: "text"; text: string };

export type ImageBlock = {
  id: string;
  type: "image";
  imageId: string;
  url: string;
  caption?: string;
};

export type GalleryBlock = {
  id: string;
  type: "gallery";
  images: { imageId: string; url: string }[];
};

export type ArtworkBlock = {
  id: string;
  type: "artwork";
  artworkId: string;
  // Editor-only preview snapshot — NOT authoritative for the real published page.
  // The Preview route and eventual public site always re-fetch the artwork's live data.
  previewTitle?: string;
  previewImageUrl?: string;
  previewPrice?: string | null;
  previewAvailability?: string;
};

export type VideoBlock = {
  id: string;
  type: "video";
  imageId: string;
  url: string;
  posterUrl?: string;
};

export type TextGridRow = { id: string; cell1: string; cell2: string; cell3: string };

// A simple 3-column table — built for lists like past exhibitions (e.g.
// Year / Exhibition / Location), but the column headers are editable so
// it works equally for press mentions, awards, or any similar list.
export type TextGridBlock = {
  id: string;
  type: "textgrid";
  columns: [string, string, string];
  rows: TextGridRow[];
};

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | ArtworkBlock
  | VideoBlock
  | TextGridBlock;

// A Section page isn't built from Content Blocks at all — it's a simple,
// fixed shape: a byline under the page title, and an ordered grid of
// artworks. Stored in the same draftBlocks/liveBlocks columns as Private
// pages (so Draft/Publish keeps working unchanged for both page types),
// just holding this shape instead of a block array.
export type SectionContent = {
  byline: string;
  artworkIds: string[];
};

// One card on a Pavilion page's freeform canvas (2026-08-30) — like
// SectionContent above, a Pavilion page isn't built from Content Blocks
// either; it's a fixed shape (an array of these cards), stored in the
// same draftBlocks/liveBlocks columns.
//
// `childPageId` points at a real Page (type PRIVATE, tagged
// sourceTag: "pavilion") created automatically the moment this card is
// added — so it's a genuine destination that can be linked from a Menu
// or filled in with its own content later, even though at creation it's
// blank. x/y/width/height are percentages of the canvas (0–100), not
// pixels, so the layout holds up across different screen sizes.
//
// `curators` (2026-08-30) — simple names, up to 9 per Pavilion. Just
// plain strings for now (no image/bio of their own yet) — this is
// deliberately the minimal shape until there's a real spec for what a
// Curator needs beyond a name.
export type PavilionCard = {
  id: string;
  name: string;
  description: string;
  imageId: string;
  imageUrl: string;
  childPageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  curators: string[];
};

export type PavilionContent = {
  cards: PavilionCard[];
};
