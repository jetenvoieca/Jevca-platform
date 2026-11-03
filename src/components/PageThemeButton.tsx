"use client";

import { usePageThemeOpen } from "@/lib/pageHeaderActions";

// The Theme icon in the site header (2026-11-03, Craig's request —
// replacing the Theme button on Pages): shown on a site's Pages page for
// an admin when there are Site Themes, it opens the list of themes to make
// one's pages on the site. Same size and navy as the icons beside it.
export default function PageThemeButton() {
  const open = usePageThemeOpen();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      title="Site Theme — make all a theme's pages on this site"
      aria-label="Site Theme"
      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="#2c3e6b" aria-hidden>
        {[0, 90, 180, 270].map((turn) => (
          <path key={turn} d="M12 12V3a5 5 0 0 1 5 5c0 2-1.5 3.2-5 4z" transform={`rotate(${turn} 12 12)`} />
        ))}
      </svg>
    </button>
  );
}
