// The settings a Menu Style holds (2026-10-06, from Craig's request) —
// how a site's menu looks and behaves, never its content: the items and
// their order are always the site's Live Pages. Saved in
// MenuStyle.layout (JSON). Plain module, not "use server", so the
// editor, the preview, the site and the server actions all share the
// same shape and the same clean-up rules.
//
// - kind: "button" — a menu button that opens the list in a panel at
//   the side of the screen; "tab" — a small tab on the screen's edge
//   that slides the list out (hover or tap).
// - position: where the button or tab sits — a corner, or the middle
//   of the left or right edge. The same on desktop and phone.
// - behaviour: "fixed" — the menu stays open after a page is chosen;
//   "floating" — it closes.
// - On phones (narrower than 768px) either kind opens full screen.
// - Design: background colour and opacity (button/tab and the open
//   menu), text colour and size, the current page's highlight colour,
//   corner rounding, shadow and background blur. Font comes later.

export const MENU_KINDS = [
  { value: "button", label: "Menu button" },
  { value: "tab", label: "Side tab" },
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

export type MenuStyleLayout = {
  kind: MenuKind;
  position: MenuPosition;
  behaviour: MenuBehaviour;
  backgroundColor: string;
  // 0–100 (%).
  backgroundOpacity: number;
  textColor: string;
  // Pixels.
  textSize: number;
  highlightColor: string;
  // Pixels.
  rounding: number;
  shadow: MenuShadow;
  // Pixels of background blur behind the menu.
  blur: number;
};

export const DEFAULT_MENU_STYLE: MenuStyleLayout = {
  kind: "button",
  position: "top-right",
  behaviour: "floating",
  backgroundColor: "#ffffff",
  backgroundOpacity: 95,
  textColor: "#404040",
  textSize: 15,
  highlightColor: "#f0f0f0",
  rounding: 6,
  shadow: "soft",
  blur: 8,
};

export const MENU_STYLE_LIMITS = {
  backgroundOpacity: { min: 0, max: 100 },
  textSize: { min: 10, max: 40 },
  rounding: { min: 0, max: 40 },
  blur: { min: 0, max: 30 },
} as const;

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

function cleanChoice<T extends string>(
  value: unknown,
  choices: readonly { value: T }[],
  fallback: T
): T {
  return choices.find((c) => c.value === value)?.value ?? fallback;
}

// Turns whatever is stored (or sent from the browser) into valid
// settings — anything unknown or malformed takes its default, so a bad
// value can never break the editor, the preview or a site.
export function normalizeMenuStyle(raw: unknown): MenuStyleLayout {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<keyof MenuStyleLayout, unknown>
  >;
  const d = DEFAULT_MENU_STYLE;
  const l = MENU_STYLE_LIMITS;
  return {
    kind: cleanChoice(value.kind, MENU_KINDS, d.kind),
    position: cleanChoice(value.position, MENU_POSITIONS, d.position),
    behaviour: cleanChoice(value.behaviour, MENU_BEHAVIOURS, d.behaviour),
    backgroundColor: cleanColour(value.backgroundColor, d.backgroundColor),
    backgroundOpacity: cleanNumber(value.backgroundOpacity, l.backgroundOpacity, d.backgroundOpacity),
    textColor: cleanColour(value.textColor, d.textColor),
    textSize: cleanNumber(value.textSize, l.textSize, d.textSize),
    highlightColor: cleanColour(value.highlightColor, d.highlightColor),
    rounding: cleanNumber(value.rounding, l.rounding, d.rounding),
    shadow: cleanChoice(value.shadow, MENU_SHADOWS, d.shadow),
    blur: cleanNumber(value.blur, l.blur, d.blur),
  };
}
