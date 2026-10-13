import type { CSSProperties } from "react";
import type { PageTextStyle } from "@/lib/pageStyleLayout";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// How a text component's settings (Page Styles → Fine-tune, 2026-10-07)
// are drawn. Anything left blank keeps the text's own look.

export function bodyTextCss(style: PageTextStyle): CSSProperties {
  return {
    fontFamily: style.font ? SITE_FONT_FAMILY[style.font] : undefined,
    fontSize: style.size ?? undefined,
    fontWeight: style.look ? (style.look === "bold" ? 700 : 400) : undefined,
    fontStyle: style.look ? (style.look === "italic" ? "italic" : "normal") : undefined,
    color: style.colour ?? undefined,
  };
}
