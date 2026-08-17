"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LAST_VISITED_SITE_KEY } from "@/components/LastVisitedSiteTracker";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
};

export default function SitesListColumn({
  sites,
  q,
  sort,
  showArchived,
  selectedId = null,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  showArchived: boolean;
  selectedId?: string | null;
}) {
  // Pins whichever site was last actually opened to the very top of the
  // list, on top of whatever server-side sort (Owner/Date) is otherwise
  // active — added 2026-08-17 so getting back to the site you were just
  // working on, after a trip to Accounts or Alerts, doesn't mean
  // re-scanning or re-searching the full list every time.
  //
  // Read from localStorage (via LastVisitedSiteTracker, mounted on every
  // site-scoped page) rather than the server, since this is a per-browser
  // convenience, not shared data — matches every other localStorage use
  // in this project. Starts null and is only set after mount, specifically
  // so the server-rendered HTML and the first client render match exactly
  // (a hydration mismatch would otherwise flash the wrong order for a
  // moment); the pin appears a beat after the list first paints instead.
  const [lastVisitedId, setLastVisitedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLastVisitedId(localStorage.getItem(LAST_VISITED_SITE_KEY));
    } catch {
      // Private browsing / storage disabled — falls back to no pinning.
    }
  }, []);

  // Only actually reorders if the pinned site is present in the current
  // (possibly search-filtered) list — searching or filtering to
  // "archived" always shows exactly what those controls say, never
  // force-including something that wouldn't otherwise match.
  const pinnedIndex = lastVisitedId
    ? sites.findIndex((s) => s.id === lastVisitedId)
    : -1;
  const displaySites =
    pinnedIndex > 0
      ? [sites[pinnedIndex], ...sites.slice(0, pinnedIndex), ...sites.slice(pinnedIndex + 1)]
      : sites;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 pb-3 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Sites</h2>
        {/* Always posts to "/" — searching or sorting from within a
            selected site's settings page takes you to the full list view
            to see the results, same as clicking a row would. */}
        <form method="get" action="/" className="flex flex-col gap-1.5">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search owner or site"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <select
              name="sort"
              defaultValue={sort}
              className="flex-1 rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
            >
              <option value="owner">Sort: Owner</option>
              <option value="date">Sort: Date</option>
            </select>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              Go
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={showArchived}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            Show archived
          </label>
        </form>
        <p className="mt-2 text-[11px] text-neutral-400">
          {sites.length} site{sites.length === 1 ? "" : "s"}
        </p>
        <Link
          href="/sites/new"
          className="mt-2 block rounded-md bg-neutral-900 px-2 py-1.5 text-center text-xs font-medium text-white hover:bg-neutral-700"
        >
          + Add New Site
        </Link>
        <Link
          href="/namecheap-sync"
          className="mt-1.5 block rounded-md border border-neutral-300 px-2 py-1.5 text-center text-xs text-neutral-600 hover:bg-neutral-50"
        >
          Namecheap Sync
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sites.length === 0 ? (
          <p className="p-4 text-xs text-neutral-500">No sites match.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {displaySites.map((site, index) => {
              const active = site.id === selectedId;
              // Only the top row can ever be the pinned one (index 0 in
              // displaySites is exactly where the reorder above puts it)
              // — checking pinnedIndex too, not just index === 0, so nothing
              // is mislabelled on the very first render before the effect
              // above has run (pinnedIndex is still -1 at that point).
              const isPinned = index === 0 && pinnedIndex > 0;
              return (
                <li key={site.id}>
                  <Link
                    href={`/sites/${site.id}`}
                    prefetch={false}
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-xs ${
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{site.ownerName}</span>
                      {site.name !== site.ownerName && (
                        <span className={active ? "text-neutral-300" : "text-neutral-400"}>
                          {" "}
                          — {site.name}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {isPinned && (
                        <span
                          className={`text-[10px] ${active ? "text-neutral-300" : "text-neutral-400"}`}
                        >
                          Recent
                        </span>
                      )}
                      {site.status === "ARCHIVED" && (
                        <span
                          className={`text-[10px] ${
                            active ? "text-neutral-300" : "text-neutral-400"
                          }`}
                        >
                          Archived
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
