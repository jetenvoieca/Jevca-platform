import { cleanColour, cleanNumber } from "@/lib/rowLayout";

// How the text in a layout's Header, Byline, Text and Text grid
// components looks (2026-10-07, from Craig's mockup; shared with Mail
// Templates 2026-10-08) — one setting per component type, for the whole
// layout: a font from the layout's own set list (lib/siteFonts.ts for
// Page Styles, lib/mailFonts.ts for Mail Templates), a size in pixels, a
// style (regular, bold, italic, light or light italic), a colour
// (#rrggbb), the space between letters, as a % of the size
// (2026-10-22, from louisedear.com) and how its lines line up (left,
// centred or right — 2026-10-24, her Story page's quote). On a page (not in a mail) a text
// can also have a smallest size (2026-10-22): it's its size on the page
// as designed and shrinks in proportion as the page narrows, down to
// that — see bodyTextCss. Anything null keeps the text's own look.

export const TEXT_COMPONENT_TYPES = [
  { value: "header", label: "Header" },
  // A line typed under the Header, usually (2026-10-13).
  { value: "byline", label: "Byline" },
  { value: "text", label: "Text" },
  { value: "textgrid", label: "Text grid" },
] as const;

export type TextComponentType = (typeof TEXT_COMPONENT_TYPES)[number]["value"];

export function isTextComponent(type: string): type is TextComponentType {
  return TEXT_COMPONENT_TYPES.some((t) => t.value === type);
}

export const TEXT_LOOKS = [
  { value: "regular", label: "Regular" },
  { value: "bold", label: "Bold" },
  { value: "italic", label: "Italic" },
  { value: "light", label: "Light" },
  { value: "lightitalic", label: "Light italic" },
] as const;

export type TextLook = (typeof TEXT_LOOKS)[number]["value"];

// How a look is drawn: its weight and whether it's italic.
export function textLookCss(look: TextLook): { weight: 300 | 400 | 700; italic: boolean } {
  return {
    weight: look === "bold" ? 700 : look === "light" || look === "lightitalic" ? 300 : 400,
    italic: look === "italic" || look === "lightitalic",
  };
}

export const TEXT_ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centred" },
  { value: "right", label: "Right" },
] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number]["value"];

export type TextStyle<F extends string = string> = {
  font: F | null;
  size: number | null;
  smallest: number | null;
  look: TextLook | null;
  colour: string | null;
  spacing: number | null;
  align: TextAlign | null;
};

export const NO_TEXT_STYLE: TextStyle<never> = {
  font: null,
  size: null,
  smallest: null,
  look: null,
  colour: null,
  spacing: null,
  align: null,
};

export type TextStyles<F extends string = string> = Record<TextComponentType, TextStyle<F>>;

export const TEXT_SIZE_LIMITS = { min: 8, max: 200 } as const;
export const LETTER_SPACING_LIMITS = { min: -10, max: 100 } as const;

// A font offered in a layout's font list.
export type FontChoice<F extends string = string> = { id: F; label: string; kind: string };

// One text component's look; a font not in the list is dropped, a
// number left blank (or not a number) stays blank, any other is kept
// within its limits — a smallest size only with a size, and smaller.
export function cleanTextStyle<F extends string>(raw: unknown, isFont: (value: unknown) => value is F): TextStyle<F> {
  const value = (raw ?? {}) as Partial<Record<keyof TextStyle, unknown>>;
  const size = optionalNumber(value.size, TEXT_SIZE_LIMITS, 0);
  const smallest = size === null ? null : optionalNumber(value.smallest, { min: TEXT_SIZE_LIMITS.min, max: size }, 0);
  return {
    font: isFont(value.font) ? value.font : null,
    size,
    smallest: smallest === size ? null : smallest,
    look: TEXT_LOOKS.find((l) => l.value === value.look)?.value ?? null,
    colour: cleanColour(value.colour),
    spacing: optionalNumber(value.spacing, LETTER_SPACING_LIMITS, 1),
    align: TEXT_ALIGNS.find((a) => a.value === value.align)?.value ?? null,
  };
}

function optionalNumber(raw: unknown, limits: { min: number; max: number }, decimals: number): number | null {
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) return null;
  return cleanNumber(raw, limits, limits.min, decimals);
}

// A layout saved before text styles existed keeps every text's own look.
export function cleanTextStyles<F extends string>(raw: unknown, isFont: (value: unknown) => value is F): TextStyles<F> {
  const value = (raw ?? {}) as Partial<Record<TextComponentType, unknown>>;
  return {
    header: cleanTextStyle(value.header, isFont),
    byline: cleanTextStyle(value.byline, isFont),
    text: cleanTextStyle(value.text, isFont),
    textgrid: cleanTextStyle(value.textgrid, isFont),
  };
}

// A text component's own look (2026-10-10, Craig's request): set from
// the Text style button on its bar, in Mail Templates, campaign mails
// and Page Styles. Anything left blank follows the layout's style for
// that kind of component (above).
export type StyledBlock<F extends string = string> = { textStyle?: TextStyle<F> };

export function isTextStyleEmpty(style: TextStyle): boolean {
  return (
    !style.font &&
    style.size === null &&
    style.smallest === null &&
    !style.look &&
    !style.colour &&
    style.spacing === null &&
    !style.align
  );
}

// What a text component is drawn with: its own settings, and the
// layout's for anything it leaves blank. Its own size comes with its own
// smallest size (blank = it doesn't shrink).
export function mergeTextStyle<F extends string>(base: TextStyle<F>, own: TextStyle<F> | undefined): TextStyle<F> {
  if (!own) return base;
  return {
    font: own.font ?? base.font,
    size: own.size ?? base.size,
    smallest: own.size !== null ? own.smallest : base.smallest,
    look: own.look ?? base.look,
    colour: own.colour ?? base.colour,
    spacing: own.spacing ?? base.spacing,
    align: own.align ?? base.align,
  };
}

// A component's own look, cleaned: only text components have one, and
// one with nothing set isn't kept.
export function cleanBlockTextStyle<F extends string>(
  type: string,
  raw: unknown,
  isFont: (value: unknown) => value is F,
): TextStyle<F> | undefined {
  if (!isTextComponent(type) || raw === undefined || raw === null) return undefined;
  const style = cleanTextStyle(raw, isFont);
  return isTextStyleEmpty(style) ? undefined : style;
}

// The component with its own look set to `style` — or removed, when
// nothing in it is set.
export function withTextStyle<B extends StyledBlock>(block: B, style: TextStyle): B {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { textStyle, ...rest } = block;
  return (isTextStyleEmpty(style) ? rest : { ...rest, textStyle: style }) as B;
}
