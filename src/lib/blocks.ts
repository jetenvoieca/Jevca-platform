// Renders as the page's on-page heading (an <h1>). Added 2026-09-03 to
// replace the editor/preview automatically printing the page's admin
// title as a heading — that auto-behaviour is gone, so a page now only
// shows a heading if one of these has deliberately been added, giving
// full control over whether/where/what it says rather than it always
// matching the internal page title.
export type HeaderBlock = { id: string; type: "header"; text: string };

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
  | HeaderBlock
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

// The shape PavilionCanvas actually needs to render and drag/resize a
// tile — deliberately minimal, so a Pavilion, a Curator, and (now) an
// Artist link can all be drawn on the same canvas by the same component
// without it needing to know which one it's looking at. x/y/width/height
// are percentages of the canvas (0–100), not pixels, so layout holds up
// across different screen sizes.
export type PavilionTile = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// One real Artist (the platform's own Artist record, ticked via the
// picker in a Curator's edit form) attached to a Curator (2026-08-30).
// `name` is a snapshot taken at the moment it's ticked — same
// editor-only-preview convention already used by ArtworkBlock above —
// deliberately not re-fetched live yet, since this whole level is
// explicitly a placeholder ("dummy cards with just a name") ahead of
// real Artist profile pages existing to link through to. `artistId` is
// the real, authoritative link.
export type PavilionCuratorArtist = PavilionTile & {
  artistId: string;
};

// A Curator attached to a Pavilion (2026-08-30) — its own full record
// with the same Name/Image/Description shape as a Pavilion itself,
// edited with the identical form. Given its own x/y/width/height so
// Curators can be shown and freely dragged/resized as cards on the
// canvas too, when "drilled into" a specific Pavilion (clicking its
// tile in full-screen mode hides every other Pavilion and shows this
// one's Curators instead). Purely nested data, not a linked Page of its
// own (unlike a Pavilion's childPageId).
//
// `artists` — real Artists ticked via the picker in this Curator's edit
// form; drilling into a Curator on the canvas shows these instead.
export type PavilionCurator = PavilionTile & {
  imageId: string;
  artists: PavilionCuratorArtist[];
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
// blank.
//
// `curators` — up to 9 per Pavilion, each a full PavilionCurator record.
export type PavilionCard = PavilionTile & {
  imageId: string;
  childPageId: string;
  curators: PavilionCurator[];
};

export type PavilionContent = {
  cards: PavilionCard[];
};
