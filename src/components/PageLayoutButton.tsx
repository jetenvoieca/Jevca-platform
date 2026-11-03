"use client";

import { usePageLayoutOpen } from "@/lib/pageHeaderActions";

// The Layout icon in the site header (2026-11-03, Craig's request —
// replacing the Layout button on Pages): shown while the page selected in
// Pages can have its layout edited (a Block Build page, for an admin, its
// Layout not already open), it opens the page's Layout. Same size and
// navy as the icons beside it.
export default function PageLayoutButton() {
  const open = usePageLayoutOpen();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      title="Change this page's layout (its Display Style), seeing its real content"
      aria-label="Change this page's layout"
      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2c3e6b" strokeWidth={2} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <path d="M10 3v18M10 12h11" />
      </svg>
    </button>
  );
}
