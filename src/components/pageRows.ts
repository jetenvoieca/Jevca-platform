import type { CSSProperties } from "react";
import type { HorizontalAlign, VerticalAlign } from "@/lib/pageStyleLayout";

// How a Display Style's rows are drawn (2026-10-07) — shared by the
// site's pages (PagePreview) and the Page Styles preview
// (PageStylePreview), so both behave the same.
//
// On a phone (below Tailwind's md, 768px) a row's blocks stack, each
// full width, with the row's "between" spacing between them. From md up
// they sit side by side at their own widths, placed by the row's
// alignment. Lives under components/ because Tailwind only reads classes
// from components/ and app/ — every class is written out in full here so
// Tailwind can find it.

const JUSTIFY: Record<HorizontalAlign, string> = {
  left: "md:justify-start",
  center: "md:justify-center",
  right: "md:justify-end",
};

const ITEMS: Record<VerticalAlign, string> = {
  top: "md:items-start",
  middle: "md:items-center",
  bottom: "md:items-end",
};

export function rowClass(horizontal: HorizontalAlign, vertical: VerticalAlign): string {
  return `flex flex-col md:flex-row ${JUSTIFY[horizontal]} ${ITEMS[vertical]}`;
}

export const ROW_BLOCK_CLASS = "min-w-0 w-full md:w-[var(--block-width)]";

// A block's desktop width, as a % of the page.
export function rowBlockStyle(width: number): CSSProperties {
  return { "--block-width": `${width}%` } as CSSProperties;
}
