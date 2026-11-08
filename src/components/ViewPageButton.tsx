"use client";

import { usePageViewReturn } from "@/lib/pageHeaderActions";
import EyeIcon from "@/components/EyeIcon";

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
      <EyeIcon />
    </button>
  );
}
