import { groupBlocksByRow } from "@/lib/blocks";
import type { PageStyleType } from "@/lib/pageStyleTypes";

// The layout a Page Style holds (2026-10-04) — the arrangement of
// components only, never content. Saved in PageStyle.layout (JSON).
// Plain module, not "use server", so the modal, the preview and the
// server actions all share the same shape and the same clean-up rules.

// The components a Private / Custom style can be built from — the same
// block types as the old block editor (see ContentBlock in blocks.ts),
// as empty placeholders, plus Sliding doors (2026-10-05).
export const LAYOUT_BLOCK_TYPES = [
  { value: "header", label: "Header" },
  { value: "text", label: "Text" },
  { value: "image", label: "Single Image" },
  { value: "gallery", label: "Gallery" },
  { value: "artwork", label: "Artwork Feature" },
  { value: "video", label: "Video" },
  { value: "textgrid", label: "Text Grid" },
  { value: "slidingdoors", label: "Sliding doors" },
] as const;

export type LayoutBlockType = (typeof LAYOUT_BLOCK_TYPES)[number]["value"];

// Sliding doors (2026-10-05, from Craig's mockup): the curation's main
// images shown full screen, `perSlide` at a time — a pair, `gap` pixels
// apart, or one at a time (e.g. a home page). After `duration` seconds
// the slide moves away over `speed` seconds, revealing the next, on a
// continuous loop. All set in the style, so every page using it behaves
// the same.
export type SlidingDoorsSettings = {
  perSlide: 1 | 2;
  duration: number;
  speed: number;
  gap: number;
};

export const DEFAULT_SLIDING_DOORS: SlidingDoorsSettings = {
  perSlide: 2,
  duration: 5,
  speed: 1.5,
  gap: 16,
};

export const SLIDING_DOORS_LIMITS = {
  duration: { min: 1, max: 60 },
  speed: { min: 0.5, max: 10 },
  gap: { min: 0, max: 100 },
} as const;

// The space between images in a grid of images (2026-10-05) — the
// Section's artwork grid, or every Gallery block in a Private / Custom
// style — in pixels: vertical = between rows, horizontal = between
// columns. One setting per style.
export type GridSpacing = { vertical: number; horizontal: number };

export const DEFAULT_GRID_SPACING: GridSpacing = { vertical: 8, horizontal: 8 };

export const GRID_SPACING_LIMITS = {
  vertical: { min: 0, max: 100 },
  horizontal: { min: 0, max: 100 },
} as const;

// The space between blocks (2026-10-05), in pixels — set separately for
// every gap, for more open layouts.
export const DEFAULT_BLOCK_SPACING = 16;
export const BLOCK_SPACING_LIMITS = { min: 0, max: 200 } as const;

// A block's width (2026-10-05), as a percentage of the page width; a
// narrower block sits centred. Blocks side by side each keep their own
// width, centred together, with the rest left as space — if together
// they're wider than the page, they shrink to fit.
export const DEFAULT_BLOCK_WIDTH = 100;
export const BLOCK_WIDTH_LIMITS = { min: 10, max: 100 } as const;

// One row of a Private / Custom layout's spacing: `below` = the space
// between this row and the next (unused on the last row), `between` =
// the space between its blocks when they sit side by side.
export type RowSpacing = { below: number; between: number };

export const DEFAULT_ROW_SPACING: RowSpacing = {
  below: DEFAULT_BLOCK_SPACING,
  between: DEFAULT_BLOCK_SPACING,
};

// A Section's spacing, one value per gap down the page.
export type SectionSpacing = {
  belowByline: number;
  belowGrid: number;
  belowDescription: number;
};

export const DEFAULT_SECTION_SPACING: SectionSpacing = {
  belowByline: DEFAULT_BLOCK_SPACING,
  belowGrid: DEFAULT_BLOCK_SPACING,
  belowDescription: DEFAULT_BLOCK_SPACING,
};

// A Section's widths, one per part.
export type SectionWidths = {
  byline: number;
  grid: number;
  description: number;
  video: number;
};

export const DEFAULT_SECTION_WIDTHS: SectionWidths = {
  byline: DEFAULT_BLOCK_WIDTH,
  grid: DEFAULT_BLOCK_WIDTH,
  description: DEFAULT_BLOCK_WIDTH,
  video: DEFAULT_BLOCK_WIDTH,
};

// `row` works as in blocks.ts: placeholders sharing a row id sit side
// by side. `width` is unset until changed (see blockWidthOf). `doors` is
// set on Sliding doors blocks only.
export type LayoutBlock = {
  id: string;
  type: LayoutBlockType;
  row?: string;
  width?: number;
  doors?: SlidingDoorsSettings;
};

export type CustomLayout = {
  // A colour is styling, so the style keeps it; null = none.
  backgroundColor: string | null;
  // Whether the page has a background image — the image itself is
  // content, chosen on the page later.
  backgroundImage: boolean;
  // Spacing for every Gallery block.
  gridSpacing: GridSpacing;
  // Each row's spacing, by rowKey(). A row with no entry uses
  // DEFAULT_ROW_SPACING.
  rowSpacing: Record<string, RowSpacing>;
  blocks: LayoutBlock[];
};

// Section is a fixed layout — a byline, an artwork grid filled from the
// page's curation, and the curation's Description below it (2026-10-05).
// Its settings: the grid's spacing, the spacing between its parts, each
// part's width, an optional background colour, and whether a video sits
// below the Description (the video itself is content, chosen on the page
// later).
export type SectionLayout = {
  gridSpacing: GridSpacing;
  spacing: SectionSpacing;
  widths: SectionWidths;
  backgroundColor: string | null;
  video: boolean;
};

// Canvas (2026-10-05, from Craig's mockups; replaced the Pavilion page
// types): a large canvas that scrolls in any direction, holding the
// curations chosen and dragged into place on each page — the canvas is
// as big as their placement needs. Each curation shows as its first
// work's main image with its name over it, `tileSize` pixels square;
// the one nearest the centre of the screen opens over `openSpeed`
// seconds, showing its first six works: the first at `openScale` times
// the tile size, the next five at half the tile size around it.
// `scrollSpeed` scales how far the canvas moves for each scroll or drag
// (1 = normal, lower = slower).
export type CanvasLayout = {
  tileSize: number;
  openSpeed: number;
  openScale: number;
  scrollSpeed: number;
  backgroundColor: string | null;
};

export const DEFAULT_CANVAS: CanvasLayout = {
  tileSize: 240,
  openSpeed: 0.6,
  openScale: 1.5,
  scrollSpeed: 0.5,
  backgroundColor: null,
};

export const CANVAS_LIMITS = {
  tileSize: { min: 80, max: 600 },
  openSpeed: { min: 0.1, max: 5 },
  openScale: { min: 1.2, max: 3 },
  scrollSpeed: { min: 0.1, max: 2 },
} as const;

export type PageStyleLayout =
  | { type: "SECTION"; layout: SectionLayout }
  | { type: "PRIVATE"; layout: CustomLayout }
  | { type: "CANVAS"; layout: CanvasLayout };

export function blockTypeLabel(type: LayoutBlockType): string {
  return LAYOUT_BLOCK_TYPES.find((t) => t.value === type)?.label ?? type;
}

// What a row's spacing is stored under: its row id when its blocks sit
// side by side, otherwise its one block's id. A block paired with
// another takes its own id as the new row id (see addLayoutBlock), so
// its spacing carries over.
export function rowKey(row: LayoutBlock[]): string {
  return row[0].row ?? row[0].id;
}

export function rowSpacingOf(layout: CustomLayout, key: string): RowSpacing {
  return layout.rowSpacing[key] ?? DEFAULT_ROW_SPACING;
}

export function blockWidthOf(block: LayoutBlock): number {
  return block.width ?? DEFAULT_BLOCK_WIDTH;
}

export function emptyLayout(type: PageStyleType): PageStyleLayout {
  if (type === "SECTION") {
    return {
      type,
      layout: {
        gridSpacing: DEFAULT_GRID_SPACING,
        spacing: DEFAULT_SECTION_SPACING,
        widths: DEFAULT_SECTION_WIDTHS,
        backgroundColor: null,
        video: false,
      },
    };
  }
  if (type === "CANVAS") return { type, layout: DEFAULT_CANVAS };
  return {
    type,
    layout: {
      backgroundColor: null,
      backgroundImage: false,
      gridSpacing: DEFAULT_GRID_SPACING,
      rowSpacing: {},
      blocks: [],
    },
  };
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function cleanColour(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value : null;
}

function isLayoutBlockType(value: unknown): value is LayoutBlockType {
  return LAYOUT_BLOCK_TYPES.some((t) => t.value === value);
}

// A number within its limits, rounded to `decimals` places; anything
// else becomes the default.
function cleanNumber(
  value: unknown,
  limits: { min: number; max: number },
  fallback: number,
  decimals: number
) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.round(Math.min(limits.max, Math.max(limits.min, n)) * factor) / factor;
}

export function cleanBlockSpacing(value: unknown): number {
  return cleanNumber(value, BLOCK_SPACING_LIMITS, DEFAULT_BLOCK_SPACING, 0);
}

export function cleanBlockWidth(value: unknown): number {
  return cleanNumber(value, BLOCK_WIDTH_LIMITS, DEFAULT_BLOCK_WIDTH, 0);
}

// A Sliding doors block saved before perSlide existed shows pairs, as
// it always did.
export function cleanSlidingDoors(raw: unknown): SlidingDoorsSettings {
  const value = (raw ?? {}) as Partial<Record<keyof SlidingDoorsSettings, unknown>>;
  const d = DEFAULT_SLIDING_DOORS;
  const l = SLIDING_DOORS_LIMITS;
  return {
    perSlide: value.perSlide === 1 ? 1 : 2,
    duration: cleanNumber(value.duration, l.duration, d.duration, 1),
    speed: cleanNumber(value.speed, l.speed, d.speed, 1),
    gap: cleanNumber(value.gap, l.gap, d.gap, 0),
  };
}

export function cleanGridSpacing(raw: unknown): GridSpacing {
  const value = (raw ?? {}) as Partial<Record<keyof GridSpacing, unknown>>;
  const d = DEFAULT_GRID_SPACING;
  const l = GRID_SPACING_LIMITS;
  return {
    vertical: cleanNumber(value.vertical, l.vertical, d.vertical, 0),
    horizontal: cleanNumber(value.horizontal, l.horizontal, d.horizontal, 0),
  };
}

export function cleanCanvas(raw: unknown): CanvasLayout {
  const value = (raw ?? {}) as Partial<Record<keyof CanvasLayout, unknown>>;
  const d = DEFAULT_CANVAS;
  const l = CANVAS_LIMITS;
  return {
    tileSize: cleanNumber(value.tileSize, l.tileSize, d.tileSize, 0),
    openSpeed: cleanNumber(value.openSpeed, l.openSpeed, d.openSpeed, 1),
    openScale: cleanNumber(value.openScale, l.openScale, d.openScale, 1),
    scrollSpeed: cleanNumber(value.scrollSpeed, l.scrollSpeed, d.scrollSpeed, 1),
    backgroundColor: cleanColour(value.backgroundColor),
  };
}

function cleanSectionSpacing(raw: unknown): SectionSpacing {
  const value = (raw ?? {}) as Partial<Record<keyof SectionSpacing, unknown>>;
  return {
    belowByline: cleanBlockSpacing(value.belowByline),
    belowGrid: cleanBlockSpacing(value.belowGrid),
    belowDescription: cleanBlockSpacing(value.belowDescription),
  };
}

function cleanSectionWidths(raw: unknown): SectionWidths {
  const value = (raw ?? {}) as Partial<Record<keyof SectionWidths, unknown>>;
  return {
    byline: cleanBlockWidth(value.byline),
    grid: cleanBlockWidth(value.grid),
    description: cleanBlockWidth(value.description),
    video: cleanBlockWidth(value.video),
  };
}

// Keeps spacing only for rows that still exist.
function cleanRowSpacing(raw: unknown, blocks: LayoutBlock[]): Record<string, RowSpacing> {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, RowSpacing> = {};
  for (const row of groupBlocksByRow(blocks)) {
    const key = rowKey(row);
    const entry = value[key] as Partial<Record<keyof RowSpacing, unknown>> | undefined;
    if (entry && typeof entry === "object") {
      out[key] = { below: cleanBlockSpacing(entry.below), between: cleanBlockSpacing(entry.between) };
    }
  }
  return out;
}

// Turns whatever is stored (or sent from the browser) into a valid
// layout for the type — anything unknown or malformed is dropped, so a
// bad value can never break the modal, the preview or a page. A style
// saved before a setting existed gets that setting's default.
export function normalizeLayout(type: PageStyleType, raw: unknown): PageStyleLayout {
  if (type === "SECTION") {
    const value = (raw ?? {}) as Partial<Record<keyof SectionLayout, unknown>>;
    return {
      type,
      layout: {
        gridSpacing: cleanGridSpacing(value.gridSpacing),
        spacing: cleanSectionSpacing(value.spacing),
        widths: cleanSectionWidths(value.widths),
        backgroundColor: cleanColour(value.backgroundColor),
        video: value.video === true,
      },
    };
  }

  if (type === "CANVAS") return { type, layout: cleanCanvas(raw) };

  const value = (raw ?? {}) as Partial<Record<keyof CustomLayout, unknown>>;
  const blocks = clearLoneRows(
    Array.isArray(value.blocks)
      ? value.blocks.flatMap((b): LayoutBlock[] => {
          const block = b as Partial<LayoutBlock>;
          if (typeof block?.id !== "string" || !isLayoutBlockType(block.type)) return [];
          const clean: LayoutBlock = { id: block.id, type: block.type };
          if (typeof block.row === "string") clean.row = block.row;
          if (block.width !== undefined) clean.width = cleanBlockWidth(block.width);
          if (block.type === "slidingdoors") clean.doors = cleanSlidingDoors(block.doors);
          return [clean];
        })
      : []
  );

  return {
    type,
    layout: {
      backgroundColor: cleanColour(value.backgroundColor),
      backgroundImage: value.backgroundImage === true,
      gridSpacing: cleanGridSpacing(value.gridSpacing),
      rowSpacing: cleanRowSpacing(value.rowSpacing, blocks),
      blocks,
    },
  };
}

// A row needs at least two placeholders; a lone one goes back to full
// width. Everything else about the block is kept.
function clearLoneRows(blocks: LayoutBlock[]): LayoutBlock[] {
  const groups = groupBlocksByRow(blocks);
  return groups.flatMap((g) => {
    if (g.length > 1) return g;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { row, ...rest } = g[0];
    return [rest];
  });
}

// Adds a placeholder at the end, or — with "left"/"right" — beside the
// last row, same as the old block editor's To left / To Right. A new
// row takes its first block's id as its row id, so that row keeps its
// spacing (see rowKey).
export function addLayoutBlock(
  blocks: LayoutBlock[],
  type: LayoutBlockType,
  placement: "none" | "left" | "right"
): LayoutBlock[] {
  const block: LayoutBlock =
    type === "slidingdoors"
      ? { id: crypto.randomUUID(), type, doors: DEFAULT_SLIDING_DOORS }
      : { id: crypto.randomUUID(), type };
  if (placement === "none" || blocks.length === 0) return [...blocks, block];

  const groups = groupBlocksByRow(blocks);
  const last = groups[groups.length - 1];
  const row = last[0].row ?? last[0].id;
  const before = groups.slice(0, -1).flat();
  const lastRow = last.map((b) => ({ ...b, row }));
  const paired = { ...block, row };
  return [...before, ...(placement === "left" ? [paired, ...lastRow] : [...lastRow, paired])];
}

export function removeLayoutBlock(blocks: LayoutBlock[], id: string): LayoutBlock[] {
  return clearLoneRows(blocks.filter((b) => b.id !== id));
}

// Changes one Sliding doors block's settings, kept within their limits.
export function updateSlidingDoors(
  blocks: LayoutBlock[],
  id: string,
  doors: SlidingDoorsSettings
): LayoutBlock[] {
  return blocks.map((b) => (b.id === id ? { ...b, doors: cleanSlidingDoors(doors) } : b));
}

// Changes one block's width, kept within its limits.
export function updateBlockWidth(blocks: LayoutBlock[], id: string, width: number): LayoutBlock[] {
  return blocks.map((b) => (b.id === id ? { ...b, width: cleanBlockWidth(width) } : b));
}

// Moves a whole row (one or more placeholders) up or down. Its spacing
// moves with it.
export function moveLayoutRow(blocks: LayoutBlock[], rowIndex: number, direction: -1 | 1) {
  const groups = groupBlocksByRow(blocks);
  const target = rowIndex + direction;
  if (target < 0 || target >= groups.length) return blocks;
  [groups[rowIndex], groups[target]] = [groups[target], groups[rowIndex]];
  return groups.flat();
}
