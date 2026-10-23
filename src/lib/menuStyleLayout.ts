import {
  DEFAULT_LOGO_BYLINE,
  DEFAULT_LOGO_HEIGHT,
  cleanLine,
  cleanLogoByline,
  cleanLogoHeight,
  type LineLook,
  type LogoByline,
  type LogoHeight,
  type PageTextStyle,
} from "@/lib/pageStyleLayout";
import { isSiteFontId } from "@/lib/siteFonts";
import { NO_TEXT_STYLE, cleanTextStyle } from "@/lib/textStyle";

// The settings a Menu Style holds (2026-10-06, from Craig's request) —
// how a site's menu looks and behaves, never its content: the items and
// their order are always the site's Live Pages. Saved in
// MenuStyle.layout (JSON). Plain module, not "use server", so the
// editor, the preview, the site and the server actions all share the
// same shape and the same clean-up rules.
//
// - kind: "button" — a menu button that opens the list in a panel at
//   the side of the screen; "tab" — a small tab on the screen's edge
//   that slides the list out (hover or tap); "sidelist" (2026-10-23,
//   from Craig's mockup of Louise Dear's gallery page) — the list always
//   shown down one side, the page beside it, staying in place as the
//   page scrolls; below `list.hamburgerBelow` pixels wide it becomes a
//   menu button. Under it, optionally, the artist's Instagram and
//   Facebook links.
// - position: where the button or tab sits — a corner, or the middle
//   of the left or right edge. The same on desktop and phone. (A Side
//   list's button sits at the top on its list's side.)
// - behaviour: "fixed" — the menu stays open after a page is chosen;
//   "floating" — it closes.
// - On phones (narrower than 700px — see lib/siteBreakpoint.ts) every
//   kind opens full screen.
// - topBar (2026-10-23, from louisedear.com): a bar across the top of
//   every page using the menu, with the artist's Logo and the words under
//   it (as a Logo component — see LogoHeight and LogoByline) and a line
//   under it; the page starts below it.
// - Design: background colour and opacity (button/tab, the open menu,
//   the top bar and side list), the words' look (`text`, 2026-10-23 —
//   was a colour and size), the current page's highlight colour (null =
//   none), corner rounding, shadow and background blur.

export const MENU_KINDS = [
  { value: "button", label: "Menu button" },
  { value: "tab", label: "Side tab" },
  { value: "sidelist", label: "Side list — always shown" },
] as const;

export type MenuKind = (typeof MENU_KINDS)[number]["value"];

export const MENU_POSITIONS = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" },
  { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
] as const;

export type MenuPosition = (typeof MENU_POSITIONS)[number]["value"];

export const MENU_BEHAVIOURS = [
  { value: "floating", label: "Floating — closes once a page is chosen" },
  { value: "fixed", label: "Fixed — stays open once a page is chosen" },
] as const;

export type MenuBehaviour = (typeof MENU_BEHAVIOURS)[number]["value"];

export const MENU_SHADOWS = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "strong", label: "Strong" },
] as const;

export type MenuShadow = (typeof MENU_SHADOWS)[number]["value"];

// The top bar: its height and the space at its ends on a desktop and a
// phone, the logo's height and the words under it, and the line under
// the bar (null = none).
export type MenuTopBar = {
  height: { desktop: number; phone: number };
  padding: { desktop: number; phone: number };
  logoHeight: LogoHeight;
  byline: LogoByline;
  line: LineLook | null;
};

// A Side list: its side and width, the space above its first page and
// between pages, how the pages line up, the width below which it
// becomes a menu button, and the look of the Instagram / Facebook links
// under it (null = not shown; `capitals` writes them in capitals).
export type MenuSideList = {
  side: "left" | "right";
  width: number;
  top: number;
  gap: number;
  align: "left" | "center" | "right";
  hamburgerBelow: number;
  social: { text: PageTextStyle; capitals: boolean } | null;
};

export type MenuStyleLayout = {
  kind: MenuKind;
  position: MenuPosition;
  behaviour: MenuBehaviour;
  backgroundColor: string;
  // 0–100 (%).
  backgroundOpacity: number;
  text: PageTextStyle;
  highlightColor: string | null;
  // Pixels.
  rounding: number;
  shadow: MenuShadow;
  // Pixels of background blur behind the menu.
  blur: number;
  topBar: MenuTopBar | null;
  list: MenuSideList;
};

export const DEFAULT_HIGHLIGHT = "#f0f0f0";

export const DEFAULT_MENU_TEXT: PageTextStyle = { ...NO_TEXT_STYLE, size: 15, colour: "#404040" };

export const DEFAULT_TOP_BAR: MenuTopBar = {
  height: { desktop: 108, phone: 72 },
  padding: { desktop: 48, phone: 24 },
  logoHeight: DEFAULT_LOGO_HEIGHT,
  byline: DEFAULT_LOGO_BYLINE,
  line: { colour: "#dfdcd7", thickness: 0.5 },
};

export const DEFAULT_SOCIAL_TEXT: PageTextStyle = {
  ...NO_TEXT_STYLE,
  font: "jost",
  size: 12,
  colour: "#7a7066",
  spacing: 14,
};

export const DEFAULT_SIDE_LIST: MenuSideList = {
  side: "right",
  width: 260,
  top: 48,
  gap: 40,
  align: "center",
  hamburgerBelow: 1024,
  social: null,
};

export const DEFAULT_MENU_STYLE: MenuStyleLayout = {
  kind: "button",
  position: "top-right",
  behaviour: "floating",
  backgroundColor: "#ffffff",
  backgroundOpacity: 95,
  text: DEFAULT_MENU_TEXT,
  highlightColor: DEFAULT_HIGHLIGHT,
  rounding: 6,
  shadow: "soft",
  blur: 8,
  topBar: null,
  list: DEFAULT_SIDE_LIST,
};

export const MENU_STYLE_LIMITS = {
  backgroundOpacity: { min: 0, max: 100 },
  rounding: { min: 0, max: 40 },
  blur: { min: 0, max: 30 },
  barHeight: { min: 32, max: 300 },
  barPadding: { min: 0, max: 200 },
  listWidth: { min: 120, max: 600 },
  listTop: { min: 0, max: 400 },
  listGap: { min: 0, max: 200 },
  hamburgerBelow: { min: 700, max: 2400 },
} as const;

// The space a menu takes from its pages (2026-10-23): the top bar's
// height, and on a wide enough screen a Side list's width on its side.
export function menuPageInset(
  layout: MenuStyleLayout,
  device: "desktop" | "phone",
  wide: boolean,
): { top: number; left: number; right: number } {
  const top = layout.topBar ? layout.topBar.height[device] : 0;
  const side = layout.kind === "sidelist" && wide ? layout.list.width : 0;
  return { top, left: layout.list.side === "left" ? side : 0, right: layout.list.side === "right" ? side : 0 };
}

// The position's side and height on the screen.
export function menuSide(position: MenuPosition): "left" | "right" {
  return position.endsWith("left") ? "left" : "right";
}

export function menuHeight(position: MenuPosition): "top" | "middle" | "bottom" {
  return position.startsWith("top") ? "top" : position.startsWith("middle") ? "middle" : "bottom";
}

// The background colour at the style's opacity, as an rgba() colour.
export function menuBackground(layout: MenuStyleLayout): string {
  const hex = layout.backgroundColor.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${layout.backgroundOpacity / 100})`;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function cleanColour(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value.toLowerCase() : fallback;
}

function cleanNumber(value: unknown, limits: { min: number; max: number }, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(limits.max, Math.max(limits.min, n)));
}

function cleanChoice<T extends string>(value: unknown, choices: readonly { value: T }[], fallback: T): T {
  return choices.find((c) => c.value === value)?.value ?? fallback;
}

type Raw<T> = Partial<Record<keyof T, unknown>>;

function asObject<T>(raw: unknown): Raw<T> {
  return (raw && typeof raw === "object" ? raw : {}) as Raw<T>;
}

function cleanDevicePair(
  raw: unknown,
  limits: { min: number; max: number },
  fallback: { desktop: number; phone: number },
) {
  const value = asObject<{ desktop: number; phone: number }>(raw);
  return {
    desktop: cleanNumber(value.desktop, limits, fallback.desktop),
    phone: cleanNumber(value.phone, limits, fallback.phone),
  };
}

function cleanTopBar(raw: unknown): MenuTopBar | null {
  if (!raw || typeof raw !== "object") return null;
  const value = asObject<MenuTopBar>(raw);
  const d = DEFAULT_TOP_BAR;
  const l = MENU_STYLE_LIMITS;
  return {
    height: cleanDevicePair(value.height, l.barHeight, d.height),
    padding: cleanDevicePair(value.padding, l.barPadding, d.padding),
    logoHeight: cleanLogoHeight(value.logoHeight),
    byline: cleanLogoByline(value.byline),
    line: value.line ? cleanLine(value.line) : null,
  };
}

function cleanSideList(raw: unknown): MenuSideList {
  const value = asObject<MenuSideList>(raw);
  const social = asObject<{ text: PageTextStyle; capitals: boolean }>(value.social);
  const d = DEFAULT_SIDE_LIST;
  const l = MENU_STYLE_LIMITS;
  return {
    side: value.side === "left" ? "left" : "right",
    width: cleanNumber(value.width, l.listWidth, d.width),
    top: cleanNumber(value.top, l.listTop, d.top),
    gap: cleanNumber(value.gap, l.listGap, d.gap),
    align: value.align === "left" || value.align === "right" ? value.align : "center",
    hamburgerBelow: cleanNumber(value.hamburgerBelow, l.hamburgerBelow, d.hamburgerBelow),
    social: value.social
      ? {
          text: social.text ? cleanTextStyle(social.text, isSiteFontId) : DEFAULT_SOCIAL_TEXT,
          capitals: social.capitals !== false,
        }
      : null,
  };
}

// The words' look. A menu saved (or a site published) before 2026-10-23
// had only a text colour and size, which it keeps.
function cleanMenuText(value: Raw<MenuStyleLayout> & { textColor?: unknown; textSize?: unknown }): PageTextStyle {
  if (value.text) return cleanTextStyle(value.text, isSiteFontId);
  return cleanTextStyle({ size: value.textSize ?? DEFAULT_MENU_TEXT.size, colour: value.textColor }, isSiteFontId);
}

// Turns whatever is stored (or sent from the browser) into valid
// settings — anything unknown or malformed takes its default, so a bad
// value can never break the editor, the preview or a site.
export function normalizeMenuStyle(raw: unknown): MenuStyleLayout {
  const value = asObject<MenuStyleLayout>(raw);
  const d = DEFAULT_MENU_STYLE;
  const l = MENU_STYLE_LIMITS;
  return {
    kind: cleanChoice(value.kind, MENU_KINDS, d.kind),
    position: cleanChoice(value.position, MENU_POSITIONS, d.position),
    behaviour: cleanChoice(value.behaviour, MENU_BEHAVIOURS, d.behaviour),
    backgroundColor: cleanColour(value.backgroundColor, d.backgroundColor),
    backgroundOpacity: cleanNumber(value.backgroundOpacity, l.backgroundOpacity, d.backgroundOpacity),
    text: cleanMenuText(value),
    highlightColor: value.highlightColor === null ? null : cleanColour(value.highlightColor, DEFAULT_HIGHLIGHT),
    rounding: cleanNumber(value.rounding, l.rounding, d.rounding),
    shadow: cleanChoice(value.shadow, MENU_SHADOWS, d.shadow),
    blur: cleanNumber(value.blur, l.blur, d.blur),
    topBar: cleanTopBar(value.topBar),
    list: cleanSideList(value.list),
  };
}
