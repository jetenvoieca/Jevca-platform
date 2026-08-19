"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAST_VISITED_SITE_KEY } from "@/components/LastVisitedSiteTracker";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
  paymentMethod: string | null;
  createdAt: string;
};

type SortValue = "owner" | "date" | "payment";

// 2026-08-19, direct request — sort used to reset to "Owner" every time
// you opened a specific site, because it lived entirely in the URL's
// ?sort= param, and the site-detail page's own copy of this list never
// carried that param through at all (it always asked the server for
// "owner" order, full stop). Rather than thread ?sort= through every
// link on every page that can render this list, sort is now a genuine
// client-side preference — same pattern as the Hopper's newest/oldest
// toggle — so it just works consistently everywhere this component
// appears, with no server round-trip needed to change it, and no page
// to forget to pass it through.
const SORT_STORAGE_KEY = "jevca:sites-sort";

function compareSites(a: SiteRow, b: SiteRow, sort: SortValue): number {
  if (sort === "date") {
    // Newest first — matches the server's original default ordering
    // (orderBy createdAt desc) for this option.
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  if (sort === "payment") {
    // No payment method set sorts last, not first — an unset value isn't
    // "before Direct Debit alphabetically", it's just not answered yet.
    const pa = a.paymentMethod || "\uFFFF";
    const pb = b.paymentMethod || "\uFFFF";
    const cmp = pa.localeCompare(pb);
    // Same type of payment groups together, then alphabetical by owner
    // within that group — otherwise same-type sites are left in
    // whatever order the server happened to return them.
    return cmp !== 0 ? cmp : a.ownerName.localeCompare(b.ownerName);
  }
  return a.ownerName.localeCompare(b.ownerName);
}

export default function SitesListColumn({
  sites,
  q,
  sort,
  status,
  selectedId = null,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  status: string;
  selectedId?: string | null;
}) {
  // Starts from whatever the server rendered (so the very first paint
  // matches exactly, no hydration mismatch), then a moment later picks
  // up whatever this browser last actually chose — same SSR-safe
  // "default now, override right after mount" pattern used for the
  // pinned-recent-site lookup just below.
  const [clientSort, setClientSort] = useState<SortValue>(
    sort === "date" || sort === "payment" ? sort : "owner"
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SORT_STORAGE_KEY);
      if (stored === "date" || stored === "payment" || stored === "owner") {
        setClientSort(stored);
      }
    } catch {
      // Private browsing / storage disabled — falls back to the
      // server-provided default above, same as everywhere else this
      // pattern is used.
    }
  }, []);

  const handleSortChange = (value: SortValue) => {
    setClientSort(value);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, value);
    } catch {
      // Non-critical — this session's choice just won't persist.
    }
  };

  // Pins whichever site was last actually opened to the very top of the
  // list, on top of whichever sort is otherwise active — added
  // 2026-08-17 so getting back to the site you were just working on,
  // after a trip to Accounts or Alerts, doesn't mean re-scanning or
  // re-searching the full list every time.
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

  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => compareSites(a, b, clientSort)),
    [sites, clientSort]
  );

  // Only actually reorders if the pinned site is present in the current
  // (possibly search-filtered) list — searching or filtering to
  // "archived" always shows exactly what those controls say, never
  // force-including something that wouldn't otherwise match.
  const pinnedIndex = lastVisitedId
    ? sortedSites.findIndex((s) => s.id === lastVisitedId)
    : -1;
  const displaySites =
    pinnedIndex > 0
      ? [
          sortedSites[pinnedIndex],
          ...sortedSites.slice(0, pinnedIndex),
          ...sortedSites.slice(pinnedIndex + 1),
        ]
      : sortedSites;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 pb-3 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Sites</h2>
        {/* Sort lives outside this form now (2026-08-19) — it's an
            instant, local re-order, not something that needs a server
            round-trip. Search text and the archived filter still do need
            fresh data from the server, so they're unchanged: always
            posts to "/" — searching or filtering from within a selected
            site's settings page takes you to the full list view to see
            the results, same as clicking a row would. */}
        <div className="flex flex-col gap-1.5">
          <form method="get" action="/" className="flex flex-col gap-1.5">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search owner or site"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              Search
            </button>
            {/* 2026-08-19, direct request — replaces a plain "Show
                archived" checkbox with a real status filter. Empty (the
                default) means everything except Archived, same as the
                checkbox's own default did; any specific status can now
                be picked to see just that one instead of it only ever
                being all-or-nothing. Submits the same way search text
                does, since this genuinely changes which sites the
                server sends back, not just how an already-loaded list
                looks (that's what Sort, separately, now does). */}
            <select
              name="status"
              defaultValue={status}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            >
              <option value="">All except Archived</option>
              <option value="DRAFT">Draft</option>
              <option value="LIVE">Live</option>
              <option value="PAUSED">Paused</option>
              <option value="ISYT">ISYT</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </form>
          <select
            value={clientSort}
            onChange={(e) => handleSortChange(e.target.value as SortValue)}
            className="w-full rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
          >
            <option value="owner">Sort: Owner</option>
            <option value="date">Sort: Date</option>
            <option value="payment">Sort: Payment</option>
          </select>
        </div>
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
                      {/* 2026-08-18, direct request — added alongside the
                          new "Sort: Payment" option, so sorting by it
                          shows what it actually grouped by rather than a
                          silent, unlabelled reshuffle. Shown regardless of
                          which sort is active, same as Archived/Recent. */}
                      {site.paymentMethod && (
                        <span
                          className={`text-[10px] ${
                            active ? "text-neutral-300" : "text-neutral-400"
                          }`}
                        >
                          {site.paymentMethod}
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

