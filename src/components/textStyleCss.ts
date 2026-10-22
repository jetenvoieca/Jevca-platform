import type { CSSProperties } from "react";
import type { PageTextStyle } from "@/lib/pageStyleLayout";
import { textLookCss } from "@/lib/textStyle";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// How a text's look on a page (Page Styles → Fine-tune, 2026-10-07) is
// drawn. Anything left blank keeps the text's own look.
//
// A text with a smallest size (2026-10-22, from louisedear.com) is its
// size on the page as designed and shrinks in proportion as the page
// narrows, down to its smallest: `designedWidth` is the width of the
// page's contents as designed (pageContentWidth), and the size follows
// the width of the page's contents now — the page frame is the container
// (container-type: inline-size) its cqi units measure.
export function bodyTextCss(style: PageTextStyle, designedWidth?: number): CSSProperties {
  const look = style.look ? textLookCss(style.look) : null;
  return {
    fontFamily: style.font ? SITE_FONT_FAMILY[style.font] : undefined,
    fontSize: fontSize(style, designedWidth),
    fontWeight: look?.weight,
    fontStyle: look ? (look.italic ? "italic" : "normal") : undefined,
    color: style.colour ?? undefined,
    letterSpacing: style.spacing !== null ? `${style.spacing / 100}em` : undefined,
  };
}

function fontSize(style: PageTextStyle, designedWidth: number | undefined): string | number | undefined {
  const { size, smallest } = style;
  if (size === null) return undefined;
  if (smallest === null || !designedWidth) return size;
  return `clamp(${smallest}px, ${((size * 100) / designedWidth).toFixed(3)}cqi, ${size}px)`;
}
