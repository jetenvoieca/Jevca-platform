"use client";

import { useEffect } from "react";

export const LAST_VISITED_SITE_KEY = "jevca:lastVisitedSiteId";

// Renders nothing — just records which site is currently open, in
// localStorage, purely as a browser-local convenience (not shared
// between Craig and Louise's own browsers, same as every other
// localStorage use in this project, e.g. the Hopper's Processed panel).
// SitesListColumn.tsx reads this back to pin the last-visited site to
// the top of the Sites list, so getting back to it after a trip to
// Accounts or Alerts doesn't mean re-scanning or re-searching the full
// list (2026-08-17).
//
// A separate component rather than adding this directly into
// src/app/sites/[id]/layout.tsx, since that layout is a Server Component
// and can't touch localStorage itself — this is mounted from there and
// otherwise renders nothing.
export default function LastVisitedSiteTracker({ siteId }: { siteId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(LAST_VISITED_SITE_KEY, siteId);
    } catch {
      // Private browsing / storage disabled — this is a convenience
      // feature only, fine to silently no-op rather than surface an
      // error for something the person never directly asked for.
    }
  }, [siteId]);

  return null;
}
