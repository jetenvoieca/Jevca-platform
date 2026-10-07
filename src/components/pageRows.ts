import type { CSSProperties } from "react";
import type { HorizontalAlign, VerticalAlign } from "@/lib/pageStyleLayout";

// How a Display Style's rows are drawn (2026-10-07) — shared by the
// site's pages (PagePreview), the Page Styles preview (PageStylePreview)
// and the visual editor (VisualLayoutEditor), so all behave the same.
//
// On a phone (below Tailwind's md, 768px) a row's blocks stack, each
// full width, with the row's "between" spacing between them. From md up
// they sit side by side at their own widths, placed by the row's
// alignment. Without a `device` the screen's width decides; the visual
// editor passes one to show that device whatever the screen. Lives under
// components/ because Tailwind only reads classes from components/ and
// app/ — every class is written out in full here so Tailwind can find it.

export type PreviewDevice = "desktop" | "phone";

const JUSTIFY: Record<HorizontalAlign, { auto: string; desktop: string }> = {
  left: { auto: "md:justify-start", desktop: "justify-start" },
  center: { auto: "md:justify-center", desktop: "justify-center" },
  right: { auto: "md:justify-end", desktop: "justify-end" },
};

const ITEMS: Record<VerticalAlign, { auto: string; desktop: string }> = {
  top: { auto: "md:items-start", desktop: "items-start" },
  middle: { auto: "md:items-center", desktop: "items-center" },
  bottom: { auto: "md:items-end", desktop: "items-end" },
};

export function rowClass(
  horizontal: HorizontalAlign,
  vertical: VerticalAlign,
  device?: PreviewDevice
): string {
  if (device === "phone") return "flex flex-col";
  if (device === "desktop") {
    return `flex flex-row ${JUSTIFY[horizontal].desktop} ${ITEMS[vertical].desktop}`;
  }
  return `flex flex-col md:flex-row ${JUSTIFY[horizontal].auto} ${ITEMS[vertical].auto}`;
}

export function rowBlockClass(device?: PreviewDevice): string {
  if (device === "phone") return "min-w-0 w-full";
  if (device === "desktop") return "min-w-0 w-[var(--block-width)]";
  return "min-w-0 w-full md:w-[var(--block-width)]";
}

// A block's desktop width, as a % of the page.
export function rowBlockStyle(width: number): CSSProperties {
  return { "--block-width": `${width}%` } as CSSProperties;
}
