import type { PageStyleType } from "@/lib/pageStyleTypes";
import { isSiteFontId, type SiteFontId } from "@/lib/siteFonts";
import {
  DEFAULT_GRID_SPACING,
  DEFAULT_PAGE_MARGINS,
  GRID_SPACING_LIMITS,
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
import {
  NO_TEXT_STYLE,
  cleanBlockTextStyle,
  cleanTextStyle,
  cleanTextStyles,
  type StyledBlock,
  type TextStyle,
  type TextStyles,
} from "@/lib/textStyle";

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
  // A home page's opening (2026-10-22, from Louise Dear's site): typed
  // words beside the curation's works, one at a time.
  { value: "hero", label: "Hero" },
  { value: "header", label: "Header" },
  // Typed on each page, usually under the Header (2026-10-13).
  { value: "byline", label: "Byline" },
  { value: "text", label: "Text" },
  { value: "image", label: "Single Image" },
  { value: "gallery", label: "Gallery" },
  { value: "artwork", label: "Feature" },
  { value: "video", label: "Video" },
  { value: "textgrid", label: "Text Grid" },
  { value: "slidingdoors", label: "Sliding doors" },
  { value: "signup", label: "Sign-up form" },
  // The artist's Logo from Settings (2026-10-13), at its `logoHeight`,
  // linking to the site's home page.
  { value: "logo", label: "Logo" },
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

// A Sign-up form's look (2026-10-10, Marketing step 5): its button's
// colour and the colour of the button's text. Set in the style (Craig's
// choice), so every page using it looks the same; the form's words use
// the style's Text look. The list it adds to and its wording are set
// per page, in Arrange (see PageSignupForm in schema.prisma).
export type SignupLook = { buttonColour: string; buttonTextColour: string };

export const DEFAULT_SIGNUP_LOOK: SignupLook = { buttonColour: "#171717", buttonTextColour: "#ffffff" };

export function cleanSignupLook(raw: unknown): SignupLook {
  const value = (raw ?? {}) as Partial<Record<keyof SignupLook, unknown>>;
  return {
    buttonColour: cleanColour(value.buttonColour) ?? DEFAULT_SIGNUP_LOOK.buttonColour,
    buttonTextColour: cleanColour(value.buttonTextColour) ?? DEFAULT_SIGNUP_LOOK.buttonTextColour,
  };
}

// A Logo's height in pixels on a desktop and on a phone (2026-10-22,
// Craig's choice, as louisedear.com: 74 and 48), its width following
// its shape — never wider than its component. Set in Fine-tune.
export type LogoHeight = { desktop: number; phone: number };
export const LOGO_HEIGHT_LIMITS = { min: 16, max: 400 } as const;
export const DEFAULT_LOGO_HEIGHT: LogoHeight = { desktop: 74, phone: 48 };

export function cleanLogoHeight(raw: unknown): LogoHeight {
  const value = (raw ?? {}) as Partial<Record<keyof LogoHeight, unknown>>;
  return {
    desktop: cleanNumber(value.desktop, LOGO_HEIGHT_LIMITS, DEFAULT_LOGO_HEIGHT.desktop, 0),
    phone: cleanNumber(value.phone, LOGO_HEIGHT_LIMITS, DEFAULT_LOGO_HEIGHT.phone, 0),
  };
}

// The words under a Logo (2026-10-22, from Louise Dear's site — typed
// once per artist in Settings → Personal Profile): their look, and where
// they sit under the logo.
export type LogoByline = { style: TextStyle<SiteFontId>; align: "left" | "center" | "right" };

export const DEFAULT_LOGO_BYLINE: LogoByline = {
  style: { ...NO_TEXT_STYLE, font: "cormorant-garamond", size: 32, look: "italic", colour: "#d4708f" },
  align: "right",
};

export function cleanLogoByline(raw: unknown): LogoByline {
  const value = (raw ?? {}) as Partial<Record<keyof LogoByline, unknown>>;
  return {
    style: value.style ? cleanTextStyle(value.style, isSiteFontId) : DEFAULT_LOGO_BYLINE.style,
    align: value.align === "left" || value.align === "center" ? value.align : "right",
  };
}

// How many images a Gallery shows across (2026-10-19, Craig's request):
// at most `desktop`, at least `phone`, and in between as many as fit
// with none narrower than `smallest` pixels (2026-10-22 — so a small
// window can still show 4 across, as Louise Dear's site does). Set in
// Fine-tune; see perRowStyle (components/pageRows.ts).
export type GalleryPerRow = { desktop: number; phone: number; smallest: number };
export const GALLERY_PER_ROW_LIMITS = { min: 1, max: 8 } as const;
export const GALLERY_SMALLEST_LIMITS = { min: 60, max: 600 } as const;
export const DEFAULT_GALLERY_PER_ROW: GalleryPerRow = { desktop: 4, phone: 2, smallest: 240 };

export function cleanGalleryPerRow(raw: unknown): GalleryPerRow {
  const value = (raw ?? {}) as Partial<Record<keyof GalleryPerRow, unknown>>;
  const l = GALLERY_PER_ROW_LIMITS;
  const d = DEFAULT_GALLERY_PER_ROW;
  return {
    desktop: cleanNumber(value.desktop, l, d.desktop, 0),
    phone: cleanNumber(value.phone, l, d.phone, 0),
    smallest: cleanNumber(value.smallest, GALLERY_SMALLEST_LIMITS, d.smallest, 0),
  };
}

// The text styles a Page Style holds use the site fonts.
export type PageTextStyle = TextStyle<SiteFontId>;

// A Gallery's works' names under their pictures (2026-10-22, from
// Louise Dear's site), in this look; null = no names.
export function cleanGalleryNames(raw: unknown): PageTextStyle | null {
  return raw ? cleanTextStyle(raw, isSiteFontId) : null;
}

// How a Gallery's works behave (2026-10-22, from louisedear.com): names
// on one line, cut with "…" when too long; on hover the picture zooms a
// little and/or a dark veil shows the price; and the work showing in a
// Hero on the same page outlined in `heroOutline` (null = not); the
// pictures' corners rounded by `rounding` pixels (0 = square).
export type GalleryTiles = {
  oneLineNames: boolean;
  zoom: boolean;
  veil: boolean;
  heroOutline: string | null;
  rounding: number;
};

export const GALLERY_ROUNDING_LIMITS = { min: 0, max: 40 } as const;

export const DEFAULT_GALLERY_TILES: GalleryTiles = {
  oneLineNames: false,
  zoom: false,
  veil: false,
  heroOutline: null,
  rounding: 4,
};

export function cleanGalleryTiles(raw: unknown): GalleryTiles {
  const value = (raw ?? {}) as Partial<Record<keyof GalleryTiles, unknown>>;
  return {
    oneLineNames: value.oneLineNames === true,
    zoom: value.zoom === true,
    veil: value.veil === true,
    heroOutline: cleanColour(value.heroOutline),
    rounding: cleanNumber(value.rounding, GALLERY_ROUNDING_LIMITS, DEFAULT_GALLERY_TILES.rounding, 0),
  };
}

export const DEFAULT_GALLERY_NAMES: PageTextStyle = {
  ...NO_TEXT_STYLE,
  font: "cormorant-garamond",
  size: 20,
  look: "italic",
  colour: "#1f1f1f",
};

// A Hero (2026-10-22, from Louise Dear's home page): beside each
// other on a desktop, the words typed on each page — a small line in
// capitals, the headline, a second headline line in its own look (e.g.
// pink italic) and a line under them — and the page's works, one at a
// time, fading to the next every `seconds` (paused while the pointer is
// over it). `pictureShare` is the picture's share of the width beside
// the `gap`. Each picture is shown whole in a box of the chosen shape
// (2026-10-22, as louisedear.com: square on a desktop, 4:3 on a phone),
// so it grows and shrinks with the width. On a phone the words and the
// picture stack — the picture first with `pictureFirstOnPhone`. Each
// line's look is set here, so every page using the style looks the
// same.
export const HERO_SHAPES = [
  { value: "square", label: "Square", ratio: "1 / 1" },
  { value: "landscape", label: "Landscape (4:3)", ratio: "4 / 3" },
  { value: "portrait", label: "Portrait (3:4)", ratio: "3 / 4" },
] as const;

export type HeroShape = (typeof HERO_SHAPES)[number]["value"];

export function heroShapeRatio(shape: HeroShape): string {
  return HERO_SHAPES.find((s) => s.value === shape)!.ratio;
}

export type HeroSettings = {
  seconds: number;
  fade: number;
  pictureShare: number;
  gap: { desktop: number; phone: number };
  shape: { desktop: HeroShape; phone: HeroShape };
  pictureFirstOnPhone: boolean;
  kicker: PageTextStyle;
  headline: PageTextStyle;
  accent: PageTextStyle;
  below: PageTextStyle;
};

export const DEFAULT_HERO: HeroSettings = {
  seconds: 5,
  fade: 1,
  pictureShare: 50,
  gap: { desktop: 64, phone: 32 },
  shape: { desktop: "square", phone: "landscape" },
  pictureFirstOnPhone: true,
  kicker: { ...NO_TEXT_STYLE, font: "jost", size: 12, look: "light", colour: "#6b6b6b", spacing: 16 },
  headline: { ...NO_TEXT_STYLE, font: "cormorant-garamond", size: 68, smallest: 42, look: "light", colour: "#1f1f1f" },
  accent: {
    ...NO_TEXT_STYLE,
    font: "cormorant-garamond",
    size: 68,
    smallest: 42,
    look: "lightitalic",
    colour: "#d4708f",
  },
  below: { ...NO_TEXT_STYLE, font: "jost", size: 15, look: "light", colour: "#6b6b6b" },
};

export const HERO_LIMITS = {
  seconds: { min: 2, max: 60 },
  fade: { min: 0, max: 5 },
  pictureShare: { min: 25, max: 75 },
  gap: { min: 0, max: 200 },
} as const;

function cleanHeroShape(raw: unknown, fallback: HeroShape): HeroShape {
  return HERO_SHAPES.find((s) => s.value === raw)?.value ?? fallback;
}

export function cleanHero(raw: unknown): HeroSettings {
  const value = (raw ?? {}) as Partial<Record<keyof HeroSettings, unknown>>;
  const gap = (value.gap ?? {}) as Partial<Record<"desktop" | "phone", unknown>>;
  const shape = (value.shape ?? {}) as Partial<Record<"desktop" | "phone", unknown>>;
  const d = DEFAULT_HERO;
  const l = HERO_LIMITS;
  const style = (v: unknown, fallback: PageTextStyle) => (v ? cleanTextStyle(v, isSiteFontId) : fallback);
  return {
    seconds: cleanNumber(value.seconds, l.seconds, d.seconds, 1),
    fade: cleanNumber(value.fade, l.fade, d.fade, 1),
    pictureShare: cleanNumber(value.pictureShare, l.pictureShare, d.pictureShare, 0),
    gap: {
      desktop: cleanNumber(gap.desktop, l.gap, d.gap.desktop, 0),
      phone: cleanNumber(gap.phone, l.gap, d.gap.phone, 0),
    },
    shape: {
      desktop: cleanHeroShape(shape.desktop, d.shape.desktop),
      phone: cleanHeroShape(shape.phone, d.shape.phone),
    },
    pictureFirstOnPhone:
      typeof value.pictureFirstOnPhone === "boolean" ? value.pictureFirstOnPhone : d.pictureFirstOnPhone,
    kicker: style(value.kicker, d.kicker),
    headline: style(value.headline, d.headline),
    accent: style(value.accent, d.accent),
    below: style(value.below, d.below),
  };
}

const DEFAULT_TEXT_STYLES: TextStyles<SiteFontId> = {
  header: NO_TEXT_STYLE,
  byline: NO_TEXT_STYLE,
  text: NO_TEXT_STYLE,
  textgrid: NO_TEXT_STYLE,
};

// A Block Build component. `doors` is set on Sliding doors blocks only,
// `signup` on Sign-up form blocks only, `logoHeight` on Logo blocks only,
// `perRow`, `names` and `tiles` on Gallery blocks only, `hero` on Hero blocks only;
// `textStyle` is a Header, Byline, Text or Text grid component's own
// look.
export type LayoutBlock = RowBlock<LayoutBlockType> &
  StyledBlock<SiteFontId> & {
    doors?: SlidingDoorsSettings;
    signup?: SignupLook;
    logoHeight?: LogoHeight;
    perRow?: GalleryPerRow;
    names?: PageTextStyle | null;
    tiles?: GalleryTiles;
    hero?: HeroSettings;
    byline?: LogoByline;
  };

// A page's grid spacing: the spacing for every Gallery, with its own
// vertical spacing on a phone (2026-10-22, from louisedear.com: 36px
// between rows on a desktop, 20px on a phone). A style saved before
// then uses its vertical spacing on phones too.
export type PageGridSpacing = GridSpacing & { phoneVertical: number };

function cleanPageGridSpacing(raw: unknown): PageGridSpacing {
  const spacing = cleanGridSpacing(raw);
  const phone = (raw as { phoneVertical?: unknown } | null)?.phoneVertical;
  return { ...spacing, phoneVertical: cleanNumber(phone, GRID_SPACING_LIMITS.vertical, spacing.vertical, 0) };
}

// The width a page is designed at, in the editors and for sizing text:
// a desktop's (1280px), or the page's maximum width when narrower.
export const PAGE_DESKTOP_WIDTH = 1280;

// The widest a page gets (2026-10-22, from louisedear.com's 1100px),
// margins included, centred — a wider window shows the background
// colour either side. null = the window's full width.
export const PAGE_MAX_WIDTH_LIMITS = { min: 600, max: 2400 } as const;
export const DEFAULT_PAGE_MAX_WIDTH = 1100;

export function pageDesignWidth(layout: Pick<BlockBuildLayout, "maxWidth">): number {
  return Math.min(PAGE_DESKTOP_WIDTH, layout.maxWidth ?? PAGE_DESKTOP_WIDTH);
}

// The width of the page's contents as designed: its design width inside
// the desktop margins.
export function pageContentWidth(layout: Pick<BlockBuildLayout, "maxWidth" | "margins">): number {
  return pageDesignWidth(layout) - 2 * layout.margins.desktop.horizontal;
}

export type BlockBuildLayout = RowLayout<LayoutBlock> & {
  // A colour is styling, so the style keeps it; null = none.
  backgroundColor: string | null;
  // Whether the page has a background image — the image itself is
  // content, chosen on the page later.
  backgroundImage: boolean;
  maxWidth: number | null;
  gridSpacing: PageGridSpacing;
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
  { type: "BLOCK_BUILD"; layout: BlockBuildLayout } | { type: "CANVAS"; layout: CanvasLayout };

export function emptyLayout(type: PageStyleType): PageStyleLayout {
  if (type === "CANVAS") return { type, layout: DEFAULT_CANVAS };
  return {
    type,
    layout: {
      backgroundColor: null,
      backgroundImage: false,
      maxWidth: null,
      gridSpacing: cleanPageGridSpacing(DEFAULT_GRID_SPACING),
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
          if (clean.type === "signup") {
            clean.signup = cleanSignupLook((b as Partial<LayoutBlock>).signup);
          }
          if (clean.type === "logo") {
            clean.logoHeight = cleanLogoHeight((b as Partial<LayoutBlock>).logoHeight);
            clean.byline = cleanLogoByline((b as Partial<LayoutBlock>).byline);
          }
          if (clean.type === "gallery") {
            clean.perRow = cleanGalleryPerRow((b as Partial<LayoutBlock>).perRow);
            clean.names = cleanGalleryNames((b as Partial<LayoutBlock>).names);
            clean.tiles = cleanGalleryTiles((b as Partial<LayoutBlock>).tiles);
          }
          if (clean.type === "hero") {
            clean.hero = cleanHero((b as Partial<LayoutBlock>).hero);
          }
          const textStyle = cleanBlockTextStyle(clean.type, (b as Partial<LayoutBlock>).textStyle, isSiteFontId);
          if (textStyle) clean.textStyle = textStyle;
          return [clean];
        })
      : [],
  );

  return {
    type,
    layout: {
      backgroundColor: cleanColour(value.backgroundColor),
      backgroundImage: value.backgroundImage === true,
      maxWidth:
        value.maxWidth === null || value.maxWidth === undefined
          ? null
          : cleanNumber(value.maxWidth, PAGE_MAX_WIDTH_LIMITS, DEFAULT_PAGE_MAX_WIDTH, 0),
      gridSpacing: cleanPageGridSpacing(value.gridSpacing),
      margins: cleanPageMargins(value.margins),
      textStyles: cleanTextStyles(value.textStyles, isSiteFontId),
      rows: cleanRows(value.rows ?? value.rowSpacing, blocks),
      blocks,
    },
  };
}

export function newLayoutBlock(type: LayoutBlockType): LayoutBlock {
  const id = crypto.randomUUID();
  if (type === "slidingdoors") return { id, type, doors: DEFAULT_SLIDING_DOORS };
  if (type === "signup") return { id, type, signup: DEFAULT_SIGNUP_LOOK };
  if (type === "logo") return { id, type, logoHeight: DEFAULT_LOGO_HEIGHT, byline: DEFAULT_LOGO_BYLINE };
  if (type === "gallery")
    return { id, type, perRow: DEFAULT_GALLERY_PER_ROW, names: null, tiles: DEFAULT_GALLERY_TILES };
  if (type === "hero") return { id, type, hero: DEFAULT_HERO };
  return { id, type };
}
