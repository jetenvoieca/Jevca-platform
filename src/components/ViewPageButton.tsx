"use client";

import { usePageViewReturn } from "@/lib/pageHeaderActions";

// The eye in the site header (2026-11-01, Craig's request): shown while a
// page's Layout or Arrange is open in Pages, it goes back to the page's
// preview. Same size and navy as the icons beside it.
export default function ViewPageButton() {
  const close = usePageViewReturn();
  if (!close) return null;
  return (
    <button
      type="button"
      onClick={close}
      title="Back to the page preview"
      aria-label="Back to the page preview"
      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
        <path d="M1.5 12C4 7.2 7.8 5 12 5s8 2.2 10.5 7c-2.5 4.8-6.3 7-10.5 7S4 16.8 1.5 12z" fill="#2c3e6b" />
        <circle cx="12" cy="12" r="4.6" fill="white" />
        <circle cx="12" cy="12" r="2.6" fill="#2c3e6b" />
      </svg>
    </button>
  );
}
