import type { CSSProperties } from "react";
import type { GridSpacing, HorizontalAlign, VerticalAlign } from "@/lib/rowLayout";

// How a Display Style's rows are drawn (2026-10-07) — shared by the
// site's pages (PagePreview), the Page Styles preview (PageStylePreview)
// and the visual editor (VisualLayoutEditor), so all behave the same.
//
// On a phone (narrower than 700px, Tailwind's `site:` — see
// lib/siteBreakpoint.ts) a row's blocks stack, each
// full width, with the row's "between" spacing between them. From md up
// they sit side by side at their own widths, placed by the row's
// alignment. Without a `device` the screen's width decides; the visual
// editor passes one to show that device whatever the screen. Lives under
// components/ because Tailwind only reads classes from components/ and
// app/ — every class is written out in full here so Tailwind can find it.

export type PreviewDevice = "desktop" | "phone";

const JUSTIFY: Record<HorizontalAlign, { auto: string; desktop: string }> = {
  left: { auto: "site:justify-start", desktop: "justify-start" },
  center: { auto: "site:justify-center", desktop: "justify-center" },
  right: { auto: "site:justify-end", desktop: "justify-end" },
};

const ITEMS: Record<VerticalAlign, { auto: string; desktop: string }> = {
  top: { auto: "site:items-start", desktop: "items-start" },
  middle: { auto: "site:items-center", desktop: "items-center" },
  bottom: { auto: "site:items-end", desktop: "items-end" },
};

export function rowClass(horizontal: HorizontalAlign, vertical: VerticalAlign, device?: PreviewDevice): string {
  if (device === "phone") return "flex flex-col";
  if (device === "desktop") {
    return `flex flex-row ${JUSTIFY[horizontal].desktop} ${ITEMS[vertical].desktop}`;
  }
  return `flex flex-col site:flex-row ${JUSTIFY[horizontal].auto} ${ITEMS[vertical].auto}`;
}

export function rowBlockClass(device?: PreviewDevice): string {
  if (device === "phone") return "min-w-0 w-full";
  if (device === "desktop") return "min-w-0 w-[var(--block-width)]";
  return "min-w-0 w-full site:w-[var(--block-width)]";
}

// A block's desktop width, as a % of the page.
export function rowBlockStyle(width: number): CSSProperties {
  return { "--block-width": `${width}%` } as CSSProperties;
}

// A component with its own width on a phone (a Logo, 2026-10-13): placed
// by its row's alignment and `phoneWidth` % of the screen on a phone,
// full width of its component from md up — and never wider than
// `maxWidth` pixels, its size on the page as designed, so it doesn't
// grow on a tablet or a wide screen. Without a `device` the screen's
// width decides.
const PHONE_JUSTIFY: Record<HorizontalAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export function phoneSizedClass(horizontal: HorizontalAlign): string {
  return `flex ${PHONE_JUSTIFY[horizontal]}`;
}

export function phoneSizedItemClass(device?: PreviewDevice): string {
  if (device === "phone") return "w-[var(--phone-width)]";
  if (device === "desktop") return "w-full";
  return "w-[var(--phone-width)] site:w-full";
}

export function phoneSizedStyle(phoneWidth: number, maxWidth: number): CSSProperties {
  return { "--phone-width": `${phoneWidth}%`, maxWidth } as CSSProperties;
}

// A Gallery's images across (2026-10-19; reworked 2026-10-22): as many
// as fit with none narrower than `smallest` pixels, but never more than
// `desktop` nor fewer than `phone` — so 4 across on a desktop steps down
// as the window narrows, to 2 on a phone. With a `device` (the visual
// editor) exactly that device's number. The space between rows is the
// grid's phone spacing on a phone (2026-10-22).
export function perRowClass(device?: PreviewDevice): string {
  if (device === "phone") return "grid grid-cols-[repeat(var(--per-row-phone),minmax(0,1fr))] gap-y-[var(--grid-vp)]";
  if (device === "desktop") return "grid grid-cols-[repeat(var(--per-row),minmax(0,1fr))] gap-y-[var(--grid-v)]";
  return "grid grid-cols-[repeat(auto-fill,minmax(var(--per-row-track),1fr))] gap-y-[var(--grid-vp)] site:gap-y-[var(--grid-v)]";
}

// The numbers across and the grid's spacing. `--per-row-track` is the
// narrowest a tile may be: the larger of `smallest` and the width that
// fits exactly `desktop` across, but no wider than fits `phone` across
// (each a hair less, so rounding never drops one). Without a phone
// vertical spacing (a mail's grid) the vertical spacing is used.
export function perRowStyle(
  perRow: { desktop: number; phone: number; smallest: number },
  spacing: GridSpacing & { phoneVertical?: number },
): CSSProperties {
  const exact = (n: number) => `calc((100% - ${(n - 1) * spacing.horizontal}px) / ${n} - 0.1px)`;
  return {
    "--per-row": perRow.desktop,
    "--per-row-phone": perRow.phone,
    "--per-row-track": `min(${exact(perRow.phone)}, max(${perRow.smallest}px, ${exact(perRow.desktop)}))`,
    "--grid-v": `${spacing.vertical}px`,
    "--grid-vp": `${spacing.phoneVertical ?? spacing.vertical}px`,
    columnGap: spacing.horizontal,
  } as CSSProperties;
}
