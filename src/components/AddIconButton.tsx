"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

// The one way to add a new item to a page's list or grid (2026-10-28,
// Craig: standardise — first used by the Profile Catalogue): a ⊞ icon
// beside the list's heading. `label` says what it adds (shown on hover
// and read out). Give `href` to go to a page, or `onClick` to act here.
// Buttons that save a form ("Add") and small in-editor ones ("+ Add
// picture") are not this.
export default function AddIconButton({
  label,
  href,
  onClick,
  disabled,
}: {
  label: string;
  href?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  const cls = "inline-flex shrink-0 rounded p-1 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40";
  const icon = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <rect x="1.5" y="1.5" width="15" height="15" rx="1" />
      <path d="M9 5v8M5 9h8" />
    </svg>
  );
  if (href) {
    return (
      <Link href={href} title={label} aria-label={label} className={cls}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={cls}>
      {icon}
    </button>
  );
}
