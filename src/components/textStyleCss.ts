import type { CSSProperties } from "react";
import type { TextStyle } from "@/lib/pageStyleLayout";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// How a text component's settings (Page Styles → Fine-tune, 2026-10-07)
// are drawn. Anything left blank keeps the text's own look.

// A Free text section's heading is a quarter bigger than the size set
// (Craig's choice).
const HEADING_SCALE = 1.25;

function hasAny(style: TextStyle): boolean {
  return Boolean(style.font || style.size || style.look || style.colour);
}

export function bodyTextCss(style: TextStyle): CSSProperties {
  return {
    fontFamily: style.font ? SITE_FONT_FAMILY[style.font] : undefined,
    fontSize: style.size ?? undefined,
    fontWeight: style.look ? (style.look === "bold" ? 700 : 400) : undefined,
    fontStyle: style.look ? (style.look === "italic" ? "italic" : "normal") : undefined,
    color: style.colour ?? undefined,
  };
}

// The same font, colour and italic, always bold, a little bigger.
export function headingTextCss(style: TextStyle): CSSProperties {
  if (!hasAny(style)) return {};
  return {
    fontFamily: style.font ? SITE_FONT_FAMILY[style.font] : undefined,
    fontSize: style.size ? Math.round(style.size * HEADING_SCALE) : undefined,
    fontWeight: 700,
    fontStyle: style.look === "italic" ? "italic" : "normal",
    color: style.colour ?? undefined,
  };
}
