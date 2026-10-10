import type { PageStyleType } from "@/lib/pageStyleTypes";
import { isSiteFontId, type SiteFontId } from "@/lib/siteFonts";
import {
  DEFAULT_GRID_SPACING,
  DEFAULT_PAGE_MARGINS,
  cleanColour,
  cleanGridSpacing,
  cleanNumber,
  cleanPageMargins,
  cleanRowBlock,
  cleanRows,
  clearLoneRows,
  type GridSpacing,
  type RowBlock,
  type RowLayout,
} from "@/lib/rowLayout";
import { cleanBlockTextStyle, cleanTextStyles, type StyledBlock, type TextStyle, type TextStyles } from "@/lib/textStyle";

// The layout a Page Style holds (2026-10-04) — the arrangement of
// components only, never content. Saved in PageStyle.layout (JSON).
// Plain module, not "use server", so the modal, the preview and the
// server actions all share the same shape and the same clean-up rules.
// The rows, widths, spacing, alignment and margins a Block Build style
// is made of are shared with Mail Templates — see lib/rowLayout.ts.

// The components a Block Build style (2026-10-07, was Private /
// Custom) is built from, as empty placeholders — each filled from the
// page's curation in the page's Arrange (see lib/pageComponents.ts).
export const LAYOUT_BLOCK_TYPES = [
  { value: "header", label: "Header" },
  { value: "text", label: "Text" },
  { value: "image", label: "Single Image" },
  { value: "gallery", label: "Gallery" },
  { value: "artwork", label: "Feature" },
  { value: "video", label: "Video" },
  { value: "textgrid", label: "Text Grid" },
  { value: "slidingdoors", label: "Sliding doors" },
] as const;

export type LayoutBlockType = (typeof LAYOUT_BLOCK_TYPES)[number]["value"];

function isLayoutBlockType(value: unknown): value is LayoutBlockType {
  return LAYOUT_BLOCK_TYPES.some((t) => t.value === value);
}

export function blockTypeLabel(type: LayoutBlockType): string {
  return LAYOUT_BLOCK_TYPES.find((t) => t.value === type)?.label ?? type;
}

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

// The text styles a Page Style holds use the site fonts.
export type PageTextStyle = TextStyle<SiteFontId>;

const DEFAULT_TEXT_STYLE: PageTextStyle = { font: null, size: null, look: null, colour: null };

const DEFAULT_TEXT_STYLES: TextStyles<SiteFontId> = {
  header: DEFAULT_TEXT_STYLE,
  text: DEFAULT_TEXT_STYLE,
  textgrid: DEFAULT_TEXT_STYLE,
};

// A Block Build component. `doors` is set on Sliding doors blocks only;
// `textStyle` is a Header, Text or Text grid component's own look.
export type LayoutBlock = RowBlock<LayoutBlockType> &
  StyledBlock<SiteFontId> & {
    doors?: SlidingDoorsSettings;
  };

export type BlockBuildLayout = RowLayout<LayoutBlock> & {
  // A colour is styling, so the style keeps it; null = none.
  backgroundColor: string | null;
  // Whether the page has a background image — the image itself is
  // content, chosen on the page later.
  backgroundImage: boolean;
  // Spacing for every Gallery block.
  gridSpacing: GridSpacing;
  // How the text in its Header, Text and Text grid components looks.
  textStyles: TextStyles<SiteFontId>;
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
  | { type: "BLOCK_BUILD"; layout: BlockBuildLayout }
  | { type: "CANVAS"; layout: CanvasLayout };

export function emptyLayout(type: PageStyleType): PageStyleLayout {
  if (type === "CANVAS") return { type, layout: DEFAULT_CANVAS };
  return {
    type,
    layout: {
      backgroundColor: null,
      backgroundImage: false,
      gridSpacing: DEFAULT_GRID_SPACING,
      margins: DEFAULT_PAGE_MARGINS,
      textStyles: DEFAULT_TEXT_STYLES,
      rows: {},
      blocks: [],
    },
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

// Turns whatever is stored (or sent from the browser) into a valid
// layout for the type — anything unknown or malformed is dropped, so a
// bad value can never break the modal, the preview or a page. A style
// saved before a setting existed gets that setting's default.
export function normalizeLayout(type: PageStyleType, raw: unknown): PageStyleLayout {
  if (type === "CANVAS") return { type, layout: cleanCanvas(raw) };

  // `rowSpacing` is what row settings were stored under before
  // alignment existed (2026-10-07); those rows keep their spacing.
  const value = (raw ?? {}) as Partial<Record<keyof BlockBuildLayout | "rowSpacing", unknown>>;
  const blocks = clearLoneRows(
    Array.isArray(value.blocks)
      ? value.blocks.flatMap((b): LayoutBlock[] => {
          const clean: LayoutBlock | null = cleanRowBlock(b, isLayoutBlockType);
          if (!clean) return [];
          if (clean.type === "slidingdoors") {
            clean.doors = cleanSlidingDoors((b as Partial<LayoutBlock>).doors);
          }
          const textStyle = cleanBlockTextStyle(clean.type, (b as Partial<LayoutBlock>).textStyle, isSiteFontId);
          if (textStyle) clean.textStyle = textStyle;
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
      textStyles: cleanTextStyles(value.textStyles, isSiteFontId),
      rows: cleanRows(value.rows ?? value.rowSpacing, blocks),
      blocks,
    },
  };
}

export function newLayoutBlock(type: LayoutBlockType): LayoutBlock {
  return type === "slidingdoors"
    ? { id: crypto.randomUUID(), type, doors: DEFAULT_SLIDING_DOORS }
    : { id: crypto.randomUUID(), type };
}
