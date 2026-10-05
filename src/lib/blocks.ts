// Shared by every Content Block (2026-09-03, side-by-side placement).
// Blocks sharing the same `row` id render together, side by side,
// instead of full-width stacked — a lightweight, additive field rather
// than restructuring the blocks array into nested rows, so every
// existing page (no block has `row` set) renders exactly as before with
// no migration needed. Deliberately unbounded — nothing stops more than
// two blocks sharing a row — even though the editor UI (PageEditor's
// "To left"/"To right") only ever builds rows of 2 for now, so a wider
// layout doesn't require touching this type again later.
//
// `width` (2026-09-04, resize sliders) — this block's relative share of
// its row's horizontal space, as a weight (default 1 when unset, i.e.
// equal split), set by dragging the vertical handle between two blocks
// in the same row. Meaningless on a block with no `row`.
//
// `rowHeight` (2026-09-04, same feature) — the row's own height in
// pixels, set by dragging the horizontal handle at the bottom of a row.
// A property of the row as a whole, not of any one block in it, so it's
// kept identical across every block sharing that `row` id — the same
// convention already used for `row` itself. Unset = natural content
// height, same as every row before this feature existed.
type BlockLayout = { row?: string; width?: number; rowHeight?: number };

// Renders as the page's on-page heading (an <h1>). Added 2026-09-03 to
// replace the editor/preview automatically printing the page's admin
// title as a heading — that auto-behaviour is gone, so a page now only
// shows a heading if one of these has deliberately been added, giving
// full control over whether/where/what it says rather than it always
// matching the internal page title.
export type HeaderBlock = BlockLayout & { id: string; type: "header"; text: string };

export type TextBlock = BlockLayout & { id: string; type: "text"; text: string };

export type ImageBlock = BlockLayout & {
  id: string;
  type: "image";
  imageId: string;
  url: string;
  caption?: string;
};

export type GalleryBlock = BlockLayout & {
  id: string;
  type: "gallery";
  images: { imageId: string; url: string }[];
};

export type ArtworkBlock = BlockLayout & {
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

export type VideoBlock = BlockLayout & {
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
export type TextGridBlock = BlockLayout & {
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

// Groups a flat blocks array into the visual rows they should render
// as — contiguous runs of blocks sharing the same non-empty `row` id
// become one group (rendered side by side); everything else is its own
// single-block group (rendered full width, exactly as before `row`
// existed). Shared by LiveBlockPreview, BlockRenderer, and PageEditor
// so the "what counts as a row" logic lives in exactly one place.
export function groupBlocksByRow<T extends { id: string; row?: string }>(blocks: T[]): T[][] {
  const groups: T[][] = [];
  for (const block of blocks) {
    const currentGroup = groups[groups.length - 1];
    if (block.row && currentGroup && currentGroup[0].row === block.row) {
      currentGroup.push(block);
    } else {
      groups.push([block]);
    }
  }
  return groups;
}

// A Section page isn't built from Content Blocks at all — it's a simple,
// fixed shape: a byline under the page title, and an ordered grid of
// artworks. Stored in the same draftBlocks/liveBlocks columns as Private
// pages (so Draft/Publish keeps working unchanged for both page types),
// just holding this shape instead of a block array.
export type SectionContent = {
  byline: string;
  artworkIds: string[];
};

// The Portfolio page style's own fixed shape (2026-09-06, first real
// TemplatePageStyle renderer) — like SectionContent above, not built
// from Content Blocks. A Portfolio is a set of named categories (e.g.
// "Head Sculptures", "Wall Mounted" — matching the isendyouthis.com
// reference), each holding an ordered list of artworks. Stored in the
// same draftBlocks/liveBlocks columns as every other page type.
export type PortfolioGroup = {
  id: string;
  name: string;
  artworkIds: string[];
};

export type PortfolioContent = {
  groups: PortfolioGroup[];
};
