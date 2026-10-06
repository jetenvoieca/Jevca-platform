import type { CSSProperties } from "react";
import type { PageMargins } from "@/lib/pageStyleLayout";

// A Display Style's page margin (2026-10-06) as padding: the phone
// values below Tailwind's md (768px), the desktop values from md up.
// The values are passed as CSS variables; the class lives here, under
// components/, because Tailwind only reads classes from components/ and
// app/. Used by the site's pages (PagePreview) and the Page Styles
// preview (PageStylePreview).
export const PAGE_MARGIN_CLASS =
  "px-[var(--margin-ph)] py-[var(--margin-pv)] md:px-[var(--margin-dh)] md:py-[var(--margin-dv)]";

export function pageMarginStyle(margins: PageMargins): CSSProperties {
  return {
    "--margin-pv": `${margins.phone.vertical}px`,
    "--margin-ph": `${margins.phone.horizontal}px`,
    "--margin-dv": `${margins.desktop.vertical}px`,
    "--margin-dh": `${margins.desktop.horizontal}px`,
  } as CSSProperties;
}
