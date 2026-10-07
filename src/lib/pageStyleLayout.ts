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
// images, `perSlide` at a time — a pair, `gap` pixels apart, or one at
// a time (e.g. a home page). After `duration` seconds the slide moves
// away over `speed` seconds, revealing the next, on a continuous loop.
// Each image sits in a square panel (2026-10-06): `height` is the
// panels' height as a % of the screen height inside the page's top &
// bottom margins, separately for desktop and phone; a narrower space
// shrinks them to fit. All set in the style, so every page using it
// behaves the same.
export type DoorsHeight = { desktop: number; phone: number };

export type SlidingDoorsSettings = {
  perSlide: 1 | 2;
  duration: number;
  speed: number;
  gap: number;
  height: DoorsHeight;
};

export const DEFAULT_SLIDING_DOORS: SlidingDoorsSettings = {
  perSlide: 2,
  duration: 5,
  speed: 1.5,
  gap: 16,
  height: { desktop: 80, phone: 80 },
};

export const SLIDING_DOORS_LIMITS = {
  duration: { min: 1, max: 60 },
  speed: { min: 0.5, max: 10 },
  gap: { min: 0, max: 100 },
  height: { min: 10, max: 100 },
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

// The page's margin (2026-10-06, from Craig's request for more
// breathing space): the space between the page's edges and its
// contents, in pixels — vertical = top and bottom, horizontal = left
// and right — set separately for desktop and phone (narrower than
// 768px). Section and Private / Custom only; a Canvas stays edge to
// edge. The page's background colour shows in it. The default is the
// padding pages had before the setting existed.
export type PageMargin = { vertical: number; horizontal: number };
export type PageMargins = { desktop: PageMargin; phone: PageMargin };

export const DEFAULT_PAGE_MARGIN: PageMargin = { vertical: 16, horizontal: 16 };

export const DEFAULT_PAGE_MARGINS: PageMargins = {
  desktop: DEFAULT_PAGE_MARGIN,
  phone: DEFAULT_PAGE_MARGIN,
};

export const PAGE_MARGIN_LIMITS = { min: 0, max: 300 } as const;

// The space between blocks (2026-10-05), in pixels — set separately for
// every gap, for more open layouts.
export const DEFAULT_BLOCK_SPACING = 16;
export const BLOCK_SPACING_LIMITS = { min: 0, max: 200 } as const;

// A block's width on desktop (2026-10-05), as a percentage of the page
// width; a narrower block sits as its row's alignment says. Blocks side
// by side each keep their own width, placed together, with the rest left
// as space — if together they're wider than the page, they shrink to
// fit. On a phone every block is full width (2026-10-07).
export const DEFAULT_BLOCK_WIDTH = 100;
export const BLOCK_WIDTH_LIMITS = { min: 10, max: 100 } as const;

// How a row sits on desktop (2026-10-07): `horizontal` places its
// blocks together left, centred or right in the page's width; `vertical`
// lines up side-by-side blocks of different heights at their tops,
// middles or bottoms. On a phone every block is stacked full width, so
// alignment applies from desktop width up only.
export const HORIZONTAL_ALIGNS = ["left", "center", "right"] as const;
export type HorizontalAlign = (typeof HORIZONTAL_ALIGNS)[number];

export const VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number];

export const DEFAULT_HORIZONTAL_ALIGN: HorizontalAlign = "center";
export const DEFAULT_VERTICAL_ALIGN: VerticalAlign = "top";

// One row of a Private / Custom layout: `below` = the space between this
// row and the next (unused on the last row), `between` = the space
// between its blocks when they sit side by side (and between them when
// stacked on a phone), plus its alignment.
export type RowSettings = {
  below: number;
  between: number;
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
};

export const DEFAULT_ROW_SETTINGS: RowSettings = {
  below: DEFAULT_BLOCK_SPACING,
  between: DEFAULT_BLOCK_SPACING,
  horizontal: DEFAULT_HORIZONTAL_ALIGN,
  vertical: DEFAULT_VERTICAL_ALIGN,
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

// A Section's parts, in order down the page (2026-10-07); the video
// only when the style has one. Each part is a row of its own.
export type SectionPart = keyof SectionWidths;

export const SECTION_PARTS: SectionPart[] = ["byline", "grid", "description", "video"];

export function sectionParts(layout: SectionLayout): SectionPart[] {
  return layout.video ? SECTION_PARTS : SECTION_PARTS.filter((p) => p !== "video");
}

// Which of a Section's spacings is the gap below a part; the video,
// always last, has none.
export function sectionSpacingBelow(part: SectionPart): keyof SectionSpacing | null {
  if (part === "byline") return "belowByline";
  if (part === "grid") return "belowGrid";
  if (part === "description") return "belowDescription";
  return null;
}

// A Section's horizontal alignment (2026-10-07), one per part — each
// part is a row of its own, so it has no vertical alignment.
export type SectionAligns = Record<keyof SectionWidths, HorizontalAlign>;

export const DEFAULT_SECTION_ALIGNS: SectionAligns = {
  byline: DEFAULT_HORIZONTAL_ALIGN,
  grid: DEFAULT_HORIZONTAL_ALIGN,
  description: DEFAULT_HORIZONTAL_ALIGN,
  video: DEFAULT_HORIZONTAL_ALIGN,
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
  margins: PageMargins;
  // Each row's spacing and alignment, by rowKey(). A row with no entry
  // uses DEFAULT_ROW_SETTINGS.
  rows: Record<string, RowSettings>;
  blocks: LayoutBlock[];
};

// Section is a fixed layout — a byline, an artwork grid filled from the
// page's curation, and the curation's Description below it (2026-10-05).
// Its settings: the grid's spacing, the page margin, the spacing between
// its parts, each part's width and alignment, an optional background
// colour, and whether a video sits below the Description (the video
// itself is content, chosen on the page later).
export type SectionLayout = {
  gridSpacing: GridSpacing;
  margins: PageMargins;
  spacing: SectionSpacing;
  widths: SectionWidths;
  aligns: SectionAligns;
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

// What a row's settings are stored under: its row id when its blocks sit
// side by side, otherwise its one block's id. A block paired with
// another takes its own id as the new row id (see addLayoutBlock), so
// its settings carry over.
export function rowKey(row: LayoutBlock[]): string {
  return row[0].row ?? row[0].id;
}

export function rowSettingsOf(layout: CustomLayout, key: string): RowSettings {
  return layout.rows[key] ?? DEFAULT_ROW_SETTINGS;
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
        margins: DEFAULT_PAGE_MARGINS,
        spacing: DEFAULT_SECTION_SPACING,
        widths: DEFAULT_SECTION_WIDTHS,
        aligns: DEFAULT_SECTION_ALIGNS,
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
      margins: DEFAULT_PAGE_MARGINS,
      rows: {},
      blocks: [],
    },
  };
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function cleanColour(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value : null;
}

function cleanHorizontalAlign(value: unknown): HorizontalAlign {
  return HORIZONTAL_ALIGNS.find((a) => a === value) ?? DEFAULT_HORIZONTAL_ALIGN;
}

function cleanVerticalAlign(value: unknown): VerticalAlign {
  return VERTICAL_ALIGNS.find((a) => a === value) ?? DEFAULT_VERTICAL_ALIGN;
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
// it always did; one saved before height existed gets the default.
export function cleanSlidingDoors(raw: unknown): SlidingDoorsSettings {
  const value = (raw ?? {}) as Partial<Record<keyof SlidingDoorsSettings, unknown>>;
  const height = (value.height ?? {}) as Partial<Record<keyof DoorsHeight, unknown>>;
  const d = DEFAULT_SLIDING_DOORS;
  const l = SLIDING_DOORS_LIMITS;
  return {
    perSlide: value.perSlide === 1 ? 1 : 2,
    duration: cleanNumber(value.duration, l.duration, d.duration, 1),
    speed: cleanNumber(value.speed, l.speed, d.speed, 1),
    gap: cleanNumber(value.gap, l.gap, d.gap, 0),
    height: {
      desktop: cleanNumber(height.desktop, l.height, d.height.desktop, 0),
      phone: cleanNumber(height.phone, l.height, d.height.phone, 0),
    },
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

function cleanPageMargin(raw: unknown): PageMargin {
  const value = (raw ?? {}) as Partial<Record<keyof PageMargin, unknown>>;
  const d = DEFAULT_PAGE_MARGIN;
  return {
    vertical: cleanNumber(value.vertical, PAGE_MARGIN_LIMITS, d.vertical, 0),
    horizontal: cleanNumber(value.horizontal, PAGE_MARGIN_LIMITS, d.horizontal, 0),
  };
}

// A style saved before margins existed gets the default on both.
export function cleanPageMargins(raw: unknown): PageMargins {
  const value = (raw ?? {}) as Partial<Record<keyof PageMargins, unknown>>;
  return { desktop: cleanPageMargin(value.desktop), phone: cleanPageMargin(value.phone) };
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

function cleanSectionAligns(raw: unknown): SectionAligns {
  const value = (raw ?? {}) as Partial<Record<keyof SectionAligns, unknown>>;
  return {
    byline: cleanHorizontalAlign(value.byline),
    grid: cleanHorizontalAlign(value.grid),
    description: cleanHorizontalAlign(value.description),
    video: cleanHorizontalAlign(value.video),
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

function cleanRowSettings(raw: unknown): RowSettings {
  const value = (raw ?? {}) as Partial<Record<keyof RowSettings, unknown>>;
  return {
    below: cleanBlockSpacing(value.below),
    between: cleanBlockSpacing(value.between),
    horizontal: cleanHorizontalAlign(value.horizontal),
    vertical: cleanVerticalAlign(value.vertical),
  };
}

// Keeps settings only for rows that still exist.
function cleanRows(raw: unknown, blocks: LayoutBlock[]): Record<string, RowSettings> {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, RowSettings> = {};
  for (const row of groupBlocksByRow(blocks)) {
    const key = rowKey(row);
    const entry = value[key];
    if (entry && typeof entry === "object") out[key] = cleanRowSettings(entry);
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
        margins: cleanPageMargins(value.margins),
        spacing: cleanSectionSpacing(value.spacing),
        widths: cleanSectionWidths(value.widths),
        aligns: cleanSectionAligns(value.aligns),
        backgroundColor: cleanColour(value.backgroundColor),
        video: value.video === true,
      },
    };
  }

  if (type === "CANVAS") return { type, layout: cleanCanvas(raw) };

  // `rowSpacing` is what row settings were stored under before
  // alignment existed (2026-10-07); those rows keep their spacing.
  const value = (raw ?? {}) as Partial<Record<keyof CustomLayout | "rowSpacing", unknown>>;
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
      margins: cleanPageMargins(value.margins),
      rows: cleanRows(value.rows ?? value.rowSpacing, blocks),
      blocks,
    },
  };
}

// A row needs at least two placeholders; a lone one goes back to full
// width. Everything else about the block is kept.
function clearLoneRows(blocks: LayoutBlock[]): LayoutBlock[] {
  return groupBlocksByRow(blocks).flatMap((g) => (g.length > 1 ? g : [withoutRow(g[0])]));
}

function withoutRow(block: LayoutBlock): LayoutBlock {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { row, ...rest } = block;
  return rest;
}

// The widths a block snaps to while its edge is dragged in the visual
// editor (2026-10-07, Craig's choice: tidy fractions, the same on every
// site). Stored as whole percentages.
export const WIDTH_SNAPS = [
  { value: 25, label: "¼" },
  { value: 33, label: "⅓" },
  { value: 50, label: "½" },
  { value: 67, label: "⅔" },
  { value: 75, label: "¾" },
  { value: 100, label: "Full" },
] as const;

export function snapBlockWidth(raw: number): number {
  return WIDTH_SNAPS.reduce((best, s) =>
    Math.abs(s.value - raw) < Math.abs(best.value - raw) ? s : best
  ).value;
}

// "½ width", or the exact % for a width set some other way.
export function blockWidthLabel(width: number): string {
  const snap = WIDTH_SNAPS.find((s) => s.value === width);
  return snap ? `${snap.label} width` : `${width}% width`;
}

// Spacing and margins dragged in the visual editor move in steps of
// this many pixels, within their limits.
export const SPACING_STEP = 4;

export function snapSpacing(raw: number, limits: { min: number; max: number }): number {
  const stepped = Math.round(raw / SPACING_STEP) * SPACING_STEP;
  return Math.min(limits.max, Math.max(limits.min, stepped));
}

// Where a dragged block lands (2026-10-07): a new row of its own before
// row `index` (rows counted as they are before the move; the row count
// = at the end), or beside another block in that block's row.
export type BlockDropTarget =
  | { kind: "row"; index: number }
  | { kind: "beside"; blockId: string; side: "left" | "right" };

export function newLayoutBlock(type: LayoutBlockType): LayoutBlock {
  return type === "slidingdoors"
    ? { id: crypto.randomUUID(), type, doors: DEFAULT_SLIDING_DOORS }
    : { id: crypto.randomUUID(), type };
}

// Puts a block — new, or already in the layout (a move) — at `target`.
// Each row keeps its spacing and alignment as long as any of its other
// blocks stay in it; a block moved into a row of its own keeps its old
// row's settings only if it was alone there.
export function placeLayoutBlock(
  layout: CustomLayout,
  block: LayoutBlock,
  target: BlockDropTarget
): CustomLayout {
  if (target.kind === "beside" && target.blockId === block.id) return layout;
  const before = groupBlocksByRow(layout.blocks);
  const groups: LayoutBlock[][] = [];
  let insertAt = -1;
  before.forEach((g, i) => {
    if (target.kind === "row" && i === target.index) insertAt = groups.length;
    const rest = g.filter((b) => b.id !== block.id);
    if (rest.length > 0) groups.push(rest);
  });

  const moving = withoutRow(block);
  if (target.kind === "row") {
    groups.splice(insertAt < 0 ? groups.length : insertAt, 0, [moving]);
  } else {
    const group = groups.find((g) => g.some((b) => b.id === target.blockId));
    if (!group) return layout;
    const at = group.findIndex((b) => b.id === target.blockId) + (target.side === "right" ? 1 : 0);
    group.splice(at, 0, moving);
  }
  return rebuildRows(layout, groups, block.id);
}

export function removeLayoutBlock(layout: CustomLayout, id: string): CustomLayout {
  const groups = groupBlocksByRow(layout.blocks)
    .map((g) => g.filter((b) => b.id !== id))
    .filter((g) => g.length > 0);
  return rebuildRows(layout, groups, id);
}

// Turns rows (as lists of blocks) back into the stored blocks and row
// settings. A row of two or more keeps its row id unless that id is
// also a block's id elsewhere (row ids used to be a block's id), when
// it gets a fresh one; its settings follow its blocks.
function rebuildRows(layout: CustomLayout, groups: LayoutBlock[][], movedId: string): CustomLayout {
  const settingsByBlock = new Map<string, RowSettings>();
  let movedWasAlone = false;
  for (const g of groupBlocksByRow(layout.blocks)) {
    const settings = layout.rows[rowKey(g)];
    if (g.length === 1 && g[0].id === movedId) movedWasAlone = true;
    if (settings) for (const b of g) settingsByBlock.set(b.id, settings);
  }
  const blockIds = new Set(groups.flat().map((b) => b.id));

  const blocks: LayoutBlock[] = [];
  const rows: Record<string, RowSettings> = {};
  for (const g of groups) {
    const kept = g.find((b) => b.id !== movedId);
    const settings = kept
      ? settingsByBlock.get(kept.id)
      : movedWasAlone
        ? settingsByBlock.get(movedId)
        : undefined;
    let key: string;
    if (g.length === 1) {
      key = g[0].id;
      blocks.push(withoutRow(g[0]));
    } else {
      const candidate = kept?.row ?? kept?.id;
      const clashes =
        candidate !== undefined && blockIds.has(candidate) && !g.some((b) => b.id === candidate);
      key = candidate && !clashes ? candidate : crypto.randomUUID();
      blocks.push(...g.map((b) => ({ ...b, row: key })));
    }
    if (settings) rows[key] = settings;
  }
  return { ...layout, blocks, rows };
}

// Changes one row's settings, kept within their limits.
export function updateRowSettings(
  layout: CustomLayout,
  key: string,
  patch: Partial<RowSettings>
): CustomLayout {
  return {
    ...layout,
    rows: { ...layout.rows, [key]: cleanRowSettings({ ...rowSettingsOf(layout, key), ...patch }) },
  };
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
