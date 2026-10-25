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
  // A picture beside a typed headline and the Description (2026-10-24,
  // from Louise Dear's Story page).
  { value: "picturewords", label: "Picture & words" },
  // A list typed on the page: date, title, pictures with captions and
  // descriptions (2026-10-24, from Louise Dear's Events & Projects).
  { value: "entries", label: "Entries" },
  // The site's name over the page's name, filled in (2026-10-25, the ISYT
  // sites).
  { value: "pageheading", label: "Page heading" },
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
  // A thin rule across the component (2026-10-23, from louisedear.com's
  // gallery pages, under the title and byline).
  { value: "line", label: "Line" },
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
// once per artist in Settings → Personal Profile): their font, style and
// colour (`style`; its size isn't used), and, all scaling with the logo
// (Craig's choice, as her site): their size as a % of the logo's height,
// tucked `up` into the logo by a % of its height and `across` from its
// left edge by a % of its width.
export type LogoByline = { style: TextStyle<SiteFontId>; size: number; up: number; across: number };

export const LOGO_BYLINE_LIMITS = {
  size: { min: 10, max: 100 },
  up: { min: 0, max: 100 },
  across: { min: 0, max: 100 },
} as const;

export const DEFAULT_LOGO_BYLINE: LogoByline = {
  style: { ...NO_TEXT_STYLE, font: "cormorant-garamond", look: "lightitalic", colour: "#e8698a" },
  size: 46,
  up: 30,
  across: 57,
};

export function cleanLogoByline(raw: unknown): LogoByline {
  const value = (raw ?? {}) as Partial<Record<keyof LogoByline, unknown>>;
  const d = DEFAULT_LOGO_BYLINE;
  const l = LOGO_BYLINE_LIMITS;
  return {
    style: value.style ? { ...cleanTextStyle(value.style, isSiteFontId), size: null, smallest: null } : d.style,
    size: cleanNumber(value.size, l.size, d.size, 0),
    up: cleanNumber(value.up, l.up, d.up, 0),
    across: cleanNumber(value.across, l.across, d.across, 0),
  };
}

// A Line's look (2026-10-23): its colour and thickness in pixels (half
// a pixel draws a hairline on a sharp screen).
export type LineLook = { colour: string; thickness: number };
export const LINE_THICKNESS_LIMITS = { min: 0.5, max: 20 } as const;
export const DEFAULT_LINE: LineLook = { colour: "#dfdcd7", thickness: 0.5 };

export function cleanLine(raw: unknown): LineLook {
  const value = (raw ?? {}) as Partial<Record<keyof LineLook, unknown>>;
  return {
    colour: cleanColour(value.colour) ?? DEFAULT_LINE.colour,
    thickness: cleanNumber(value.thickness, LINE_THICKNESS_LIMITS, DEFAULT_LINE.thickness, 1),
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

// The shapes a picture's box can take (2026-10-22, a Hero's; shared
// 2026-10-24 with Picture & words): the picture is shown in a box of
// this shape.
export const PICTURE_SHAPES = [
  { value: "square", label: "Square", ratio: "1 / 1" },
  { value: "landscape", label: "Landscape (4:3)", ratio: "4 / 3" },
  { value: "portrait", label: "Portrait (3:4)", ratio: "3 / 4" },
] as const;

export type PictureShape = (typeof PICTURE_SHAPES)[number]["value"];

export function pictureShapeRatio(shape: PictureShape): string {
  return PICTURE_SHAPES.find((s) => s.value === shape)!.ratio;
}

function cleanPictureShape(raw: unknown, fallback: PictureShape): PictureShape {
  return PICTURE_SHAPES.find((s) => s.value === raw)?.value ?? fallback;
}

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
export type HeroSettings = {
  seconds: number;
  fade: number;
  pictureShare: number;
  gap: { desktop: number; phone: number };
  shape: { desktop: PictureShape; phone: PictureShape };
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
      desktop: cleanPictureShape(shape.desktop, d.shape.desktop),
      phone: cleanPictureShape(shape.phone, d.shape.phone),
    },
    pictureFirstOnPhone:
      typeof value.pictureFirstOnPhone === "boolean" ? value.pictureFirstOnPhone : d.pictureFirstOnPhone,
    kicker: style(value.kicker, d.kicker),
    headline: style(value.headline, d.headline),
    accent: style(value.accent, d.accent),
    below: style(value.below, d.below),
  };
}

// Picture & words (2026-10-24, from Louise Dear's Story page): a
// picture beside a headline and the curation's Description. The picture
// is the first of the page's Supporting Media or works (as arranged on
// the page), filling a box of the chosen shape, on the `side` chosen, its
// share of the width `pictureShare` beside the `gap`. The headline and a
// second line in its own look are typed on each page; `headlineSpace`
// is the space under them; the words sit at the top or the middle of
// the picture. On a phone they stack, the picture first with
// `pictureFirstOnPhone`.
export type PictureWordsSettings = {
  side: "left" | "right";
  pictureShare: number;
  gap: { desktop: number; phone: number };
  shape: { desktop: PictureShape; phone: PictureShape };
  pictureFirstOnPhone: boolean;
  wordsAt: "top" | "middle";
  headlineSpace: number;
  headline: PageTextStyle;
  accent: PageTextStyle;
  body: PageTextStyle;
};

export const DEFAULT_PICTURE_WORDS: PictureWordsSettings = {
  side: "left",
  pictureShare: 50,
  gap: { desktop: 80, phone: 32 },
  shape: { desktop: "portrait", phone: "portrait" },
  pictureFirstOnPhone: true,
  wordsAt: "top",
  headlineSpace: 32,
  headline: { ...NO_TEXT_STYLE, font: "cormorant-garamond", size: 42, look: "light", colour: "#1a1714" },
  accent: { ...NO_TEXT_STYLE, font: "cormorant-garamond", size: 42, look: "lightitalic", colour: "#e8698a" },
  body: { ...NO_TEXT_STYLE, font: "jost", size: 15, look: "light", colour: "#7a7066" },
};

export const PICTURE_WORDS_LIMITS = {
  pictureShare: { min: 25, max: 75 },
  gap: { min: 0, max: 200 },
  headlineSpace: { min: 0, max: 200 },
} as const;

export function cleanPictureWords(raw: unknown): PictureWordsSettings {
  const value = (raw ?? {}) as Partial<Record<keyof PictureWordsSettings, unknown>>;
  const gap = (value.gap ?? {}) as Partial<Record<"desktop" | "phone", unknown>>;
  const shape = (value.shape ?? {}) as Partial<Record<"desktop" | "phone", unknown>>;
  const d = DEFAULT_PICTURE_WORDS;
  const l = PICTURE_WORDS_LIMITS;
  const style = (v: unknown, fallback: PageTextStyle) => (v ? cleanTextStyle(v, isSiteFontId) : fallback);
  return {
    side: value.side === "right" ? "right" : "left",
    pictureShare: cleanNumber(value.pictureShare, l.pictureShare, d.pictureShare, 0),
    gap: {
      desktop: cleanNumber(gap.desktop, l.gap, d.gap.desktop, 0),
      phone: cleanNumber(gap.phone, l.gap, d.gap.phone, 0),
    },
    shape: {
      desktop: cleanPictureShape(shape.desktop, d.shape.desktop),
      phone: cleanPictureShape(shape.phone, d.shape.phone),
    },
    pictureFirstOnPhone:
      typeof value.pictureFirstOnPhone === "boolean" ? value.pictureFirstOnPhone : d.pictureFirstOnPhone,
    wordsAt: value.wordsAt === "middle" ? "middle" : "top",
    headlineSpace: cleanNumber(value.headlineSpace, l.headlineSpace, d.headlineSpace, 0),
    headline: style(value.headline, d.headline),
    accent: style(value.accent, d.accent),
    body: style(value.body, d.body),
  };
}

// Entries (2026-10-24, from Louise Dear's Events & Projects): a list
// typed on each page (lib/pageEntries.ts). Each entry: its date, title
// (`titleSpace` under them), then its pictures, each `pictureWidth`
// pixels wide in a box of `shape` beside its description, with its
// caption under it (the full width above the description on a phone),
// `pictureSpace` apart. `entrySpace` above and below the `line` between
// entries (null = no line).
export type EntriesSettings = {
  pictureWidth: number;
  shape: PictureShape;
  gap: number;
  pictureSpace: number;
  titleSpace: number;
  entrySpace: number;
  line: LineLook | null;
  date: PageTextStyle;
  title: PageTextStyle;
  caption: PageTextStyle;
  text: PageTextStyle;
};

export const DEFAULT_ENTRIES: EntriesSettings = {
  pictureWidth: 200,
  shape: "square",
  gap: 32,
  pictureSpace: 32,
  titleSpace: 24,
  entrySpace: 48,
  line: { colour: "#dfdcd7", thickness: 0.5 },
  date: { ...NO_TEXT_STYLE, font: "jost", size: 11, look: "regular", colour: "#c4965a", spacing: 14 },
  title: { ...NO_TEXT_STYLE, font: "cormorant-garamond", size: 22, look: "regular", colour: "#1a1714" },
  caption: { ...NO_TEXT_STYLE, font: "jost", size: 11, look: "italic", colour: "#7a7066", align: "center" },
  text: { ...NO_TEXT_STYLE, font: "jost", size: 14, look: "light", colour: "#7a7066" },
};

export const ENTRIES_LIMITS = {
  pictureWidth: { min: 60, max: 600 },
  space: { min: 0, max: 200 },
} as const;

export function cleanEntriesSettings(raw: unknown): EntriesSettings {
  const value = (raw ?? {}) as Partial<Record<keyof EntriesSettings, unknown>>;
  const d = DEFAULT_ENTRIES;
  const space = ENTRIES_LIMITS.space;
  const style = (v: unknown, fallback: PageTextStyle) => (v ? cleanTextStyle(v, isSiteFontId) : fallback);
  return {
    pictureWidth: cleanNumber(value.pictureWidth, ENTRIES_LIMITS.pictureWidth, d.pictureWidth, 0),
    shape: cleanPictureShape(value.shape, d.shape),
    gap: cleanNumber(value.gap, space, d.gap, 0),
    pictureSpace: cleanNumber(value.pictureSpace, space, d.pictureSpace, 0),
    titleSpace: cleanNumber(value.titleSpace, space, d.titleSpace, 0),
    entrySpace: cleanNumber(value.entrySpace, space, d.entrySpace, 0),
    line: value.line === null ? null : value.line ? cleanLine(value.line) : d.line,
    date: style(value.date, d.date),
    title: style(value.title, d.title),
    caption: style(value.caption, d.caption),
    text: style(value.text, d.text),
  };
}

// A Page heading (2026-10-25, the ISYT sites): the site's name over the
// page's name (lib/pageHeading.ts), each in its own look, `gap` apart,
// with an optional line under them `lineSpace` below. `showPage` false:
// the site's name only (an ISYT home page).
export type PageHeadingSettings = {
  showPage: boolean;
  name: PageTextStyle;
  page: PageTextStyle;
  gap: number;
  line: LineLook | null;
  lineSpace: number;
};

export const DEFAULT_PAGE_HEADING: PageHeadingSettings = {
  showPage: true,
  name: { ...NO_TEXT_STYLE, size: 40, look: "bold", colour: "#777777" },
  page: { ...NO_TEXT_STYLE, size: 52, look: "regular", colour: "#bbbbbb" },
  gap: 0,
  line: { colour: "#cccccc", thickness: 1 },
  lineSpace: 40,
};

export const PAGE_HEADING_LIMITS = { space: { min: 0, max: 200 } } as const;

export function cleanPageHeading(raw: unknown): PageHeadingSettings {
  const value = (raw ?? {}) as Partial<Record<keyof PageHeadingSettings, unknown>>;
  const d = DEFAULT_PAGE_HEADING;
  const space = PAGE_HEADING_LIMITS.space;
  const style = (v: unknown, fallback: PageTextStyle) => (v ? cleanTextStyle(v, isSiteFontId) : fallback);
  return {
    showPage: value.showPage !== false,
    name: style(value.name, d.name),
    page: style(value.page, d.page),
    gap: cleanNumber(value.gap, space, d.gap, 0),
    line: value.line === null ? null : value.line ? cleanLine(value.line) : d.line,
    lineSpace: cleanNumber(value.lineSpace, space, d.lineSpace, 0),
  };
}

const DEFAULT_TEXT_STYLES: TextStyles<SiteFontId> = {
  header: NO_TEXT_STYLE,
  byline: NO_TEXT_STYLE,
  text: NO_TEXT_STYLE,
  textgrid: NO_TEXT_STYLE,
};

// A Block Build component. Each kind's own settings are set on it only:
// `doors` (Sliding doors), `signup` (Sign-up form), `logoHeight` and
// `byline` (Logo), `line` (Line), `perRow`, `names` and `tiles`
// (Gallery), `hero` (Hero), `pictureWords` (Picture & words), `entries`
// (Entries), `pageHeading` (Page heading).
// `textStyle` is a Header, Byline, Text or Text grid component's own
// look.
export type LayoutBlock = RowBlock<LayoutBlockType> &
  StyledBlock<SiteFontId> & {
    doors?: SlidingDoorsSettings;
    signup?: SignupLook;
    logoHeight?: LogoHeight;
    line?: LineLook;
    perRow?: GalleryPerRow;
    names?: PageTextStyle | null;
    tiles?: GalleryTiles;
    hero?: HeroSettings;
    pictureWords?: PictureWordsSettings;
    entries?: EntriesSettings;
    pageHeading?: PageHeadingSettings;
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
  // Its own background on a phone (2026-10-25, the ISYT home page: dark
  // on a desktop, white on a phone); null = the same as on a desktop.
  phoneBackgroundColor: string | null;
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
      phoneBackgroundColor: null,
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
          if (clean.type === "line") {
            clean.line = cleanLine((b as Partial<LayoutBlock>).line);
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
          if (clean.type === "pageheading") {
            clean.pageHeading = cleanPageHeading((b as Partial<LayoutBlock>).pageHeading);
          }
          if (clean.type === "entries") {
            clean.entries = cleanEntriesSettings((b as Partial<LayoutBlock>).entries);
          }
          if (clean.type === "picturewords") {
            clean.pictureWords = cleanPictureWords((b as Partial<LayoutBlock>).pictureWords);
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
      phoneBackgroundColor: cleanColour(value.phoneBackgroundColor),
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
  if (type === "line") return { id, type, line: DEFAULT_LINE };
  if (type === "logo") return { id, type, logoHeight: DEFAULT_LOGO_HEIGHT, byline: DEFAULT_LOGO_BYLINE };
  if (type === "gallery")
    return { id, type, perRow: DEFAULT_GALLERY_PER_ROW, names: null, tiles: DEFAULT_GALLERY_TILES };
  if (type === "hero") return { id, type, hero: DEFAULT_HERO };
  if (type === "picturewords") return { id, type, pictureWords: DEFAULT_PICTURE_WORDS };
  if (type === "entries") return { id, type, entries: DEFAULT_ENTRIES };
  if (type === "pageheading") return { id, type, pageHeading: DEFAULT_PAGE_HEADING };
  return { id, type };
}
