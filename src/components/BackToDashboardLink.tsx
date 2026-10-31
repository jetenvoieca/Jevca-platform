"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Back to the Dashboard's alerts (2026-10-31, Craig's mockup): a light
// blue return icon, left of the site's publish icon — only on a page
// opened from a Dashboard alert, which adds ?from=dashboard to its link
// (e.g. a Hopper alert's Open Hopper — see storedAlertLink in
// lib/alerts.ts). Same size and spacing as the icons beside it.
export default function BackToDashboardLink() {
  const params = useSearchParams();
  if (params.get("from") !== "dashboard") return null;
  return (
    <Link
      href="/accounts/dashboard?tab=alert"
      title="Back to alerts"
      aria-label="Back to alerts"
      className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="#4BA3DD" />
        <path
          d="M14.5 17.5v-6.5a1.5 1.5 0 0 0-1.5-1.5H8M10.5 7L8 9.5l2.5 2.5"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
