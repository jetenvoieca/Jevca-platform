import { cleanColour, cleanNumber } from "@/lib/rowLayout";

// How the text in a layout's Header, Text and Text grid components looks
// (2026-10-07, from Craig's mockup; shared with Mail Templates
// 2026-10-08) — one setting per component type, for the whole layout,
// the same on desktop and phone: a font from the layout's own set list
// (lib/siteFonts.ts for Page Styles, lib/mailFonts.ts for Mail
// Templates), a size in pixels, a style (regular, bold or italic) and a
// colour (#rrggbb). Anything null keeps the text's own look.

export const TEXT_COMPONENT_TYPES = [
  { value: "header", label: "Header" },
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
] as const;

export type TextLook = (typeof TEXT_LOOKS)[number]["value"];

export type TextStyle<F extends string = string> = {
  font: F | null;
  size: number | null;
  look: TextLook | null;
  colour: string | null;
};

export type TextStyles<F extends string = string> = Record<TextComponentType, TextStyle<F>>;

export const TEXT_SIZE_LIMITS = { min: 8, max: 200 } as const;

// A font offered in a layout's font list.
export type FontChoice<F extends string = string> = { id: F; label: string; kind: string };

// One text component's look; a font not in the list is dropped, a size
// left blank (or not a number) stays blank, any other size is kept
// within its limits.
export function cleanTextStyle<F extends string>(
  raw: unknown,
  isFont: (value: unknown) => value is F
): TextStyle<F> {
  const value = (raw ?? {}) as Partial<Record<keyof TextStyle, unknown>>;
  const size =
    value.size === null || value.size === undefined || value.size === ""
      ? null
      : Number.isFinite(Number(value.size))
        ? cleanNumber(value.size, TEXT_SIZE_LIMITS, TEXT_SIZE_LIMITS.min, 0)
        : null;
  return {
    font: isFont(value.font) ? value.font : null,
    size,
    look: TEXT_LOOKS.find((l) => l.value === value.look)?.value ?? null,
    colour: cleanColour(value.colour),
  };
}

// A layout saved before text styles existed keeps every text's own look.
export function cleanTextStyles<F extends string>(
  raw: unknown,
  isFont: (value: unknown) => value is F
): TextStyles<F> {
  const value = (raw ?? {}) as Partial<Record<TextComponentType, unknown>>;
  return {
    header: cleanTextStyle(value.header, isFont),
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
  return !style.font && style.size === null && !style.look && !style.colour;
}

// What a text component is drawn with: its own settings, and the
// layout's for anything it leaves blank.
export function mergeTextStyle<F extends string>(base: TextStyle<F>, own: TextStyle<F> | undefined): TextStyle<F> {
  if (!own) return base;
  return {
    font: own.font ?? base.font,
    size: own.size ?? base.size,
    look: own.look ?? base.look,
    colour: own.colour ?? base.colour,
  };
}

// A component's own look, cleaned: only text components have one, and
// one with nothing set isn't kept.
export function cleanBlockTextStyle<F extends string>(
  type: string,
  raw: unknown,
  isFont: (value: unknown) => value is F
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
