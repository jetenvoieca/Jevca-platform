import type { CSSProperties } from "react";
import type { PageMargins } from "@/lib/rowLayout";

// A Display Style's page margin (2026-10-06) as padding: the phone
// values below 700px, the desktop values from there up (Tailwind's
// `site:`, see lib/siteBreakpoint.ts).
// The values are passed as CSS variables; the class lives here, under
// components/, because Tailwind only reads classes from components/ and
// app/. Used by the site's pages (PagePreview) and the Page Styles
// preview (PageStylePreview).
export const PAGE_MARGIN_CLASS =
  "px-[var(--margin-ph)] py-[var(--margin-pv)] site:px-[var(--margin-dh)] site:py-[var(--margin-dv)]";

export function pageMarginStyle(margins: PageMargins): CSSProperties {
  return {
    "--margin-pv": `${margins.phone.vertical}px`,
    "--margin-ph": `${margins.phone.horizontal}px`,
    "--margin-dv": `${margins.desktop.vertical}px`,
    "--margin-dh": `${margins.desktop.horizontal}px`,
  } as CSSProperties;
}
