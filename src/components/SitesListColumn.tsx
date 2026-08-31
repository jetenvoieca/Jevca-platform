"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LAST_VISITED_SITE_KEY } from "@/components/LastVisitedSiteTracker";
import { SITES_STATUS_FILTER_COOKIE } from "@/lib/sitesStatusFilter";

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

// 2026-08-31, direct request — search used to require a separate
// "Search" button click and a full form submit. Typing now debounces
// (300ms) and updates the "q" URL param via router.replace, which is
// what actually re-runs the server-side, database-level filter in
// src/app/page.tsx. Deliberately NOT filtering the already-fetched
// `sites` prop client-side instead — with this list meant to grow past
// 100 sites, only ever fetching the page that matches the current
// search (same reasoning as the status-filter cookie below) is what
// scales, rather than fetching everything up front.
const SEARCH_DEBOUNCE_MS = 300;

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

// Small inline sync icon for the Namecheap Sync link — kept as a plain
// SVG rather than pulling in an icon library for one glyph.
function SyncIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export default function SitesListColumn({
  sites,
  q,
  sort,
  status,
  selectedId = null,
  liveSearch = true,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  status: string;
  selectedId?: string | null;
  // The Sites Directory ("/") wants search-as-you-type against the full,
  // server-side catalogue — that's this component's default. The
  // per-site settings page also renders this same component as a
  // compact "jump to another site" panel
  // (src/app/sites/[id]/page.tsx), and that usage was deliberately kept
  // simple — its list is already fully loaded, so that caller passes
  // liveSearch={false} to filter it locally, in the browser, with no
  // navigation at all. That's what stops a search there from ever
  // knocking you off the site you're currently editing.
  liveSearch?: boolean;
}) {
  const router = useRouter();

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

  // Debounced search-as-you-type. Uncontrolled input (defaultValue={q})
  // so the server-rendered value shows immediately with no flicker;
  // each keystroke resets a timer, and only the last one in a burst
  // actually triggers a navigation — otherwise every keystroke would
  // fire its own server round-trip.
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      const queryString = params.toString();
      router.replace(queryString ? `/?${queryString}` : "/");
    }, SEARCH_DEBOUNCE_MS);
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

  // Non-live-search mode (the per-site "jump to another site" panel)
  // filters the already-fetched `sites` prop entirely in the browser —
  // no navigation at all, so the page you're on, and everything in its
  // header/nav, never changes. That's deliberately different from the
  // Directory's server-side search: this panel's list is a bounded,
  // already-loaded convenience set (whatever the current Status filter
  // returns), not the full unbounded catalogue, so filtering it in
  // memory is cheap and never needs a round-trip.
  const [localFilter, setLocalFilter] = useState(q);

  const visibleSites = useMemo(() => {
    if (liveSearch) return sites;
    const term = localFilter.trim().toLowerCase();
    if (!term) return sites;
    return sites.filter(
      (s) =>
        s.ownerName.toLowerCase().includes(term) || s.name.toLowerCase().includes(term)
    );
  }, [sites, liveSearch, localFilter]);

  const sortedSites = useMemo(
    () => [...visibleSites].sort((a, b) => compareSites(a, b, clientSort)),
    [visibleSites, clientSort]
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
        {/* Header row — title left, "+ Add New" and the Namecheap Sync
            icon on the right. Namecheap Sync used to be its own full-width
            button under the filters; it's a low-frequency admin action,
            so it's now a small icon next to Add New rather than competing
            for space with the controls people use on every visit. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Sites</h2>
          <div className="flex items-center gap-1.5">
            <Link
              href="/namecheap-sync"
              title="Namecheap Sync"
              aria-label="Namecheap Sync"
              className="rounded-md border border-neutral-300 p-1 text-neutral-500 hover:bg-neutral-50"
            >
              <SyncIcon />
            </Link>
            <Link
              href="/sites/new"
              className="text-xs font-medium text-neutral-900 hover:underline"
            >
              + Add New
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {/* On the Sites Directory, this filters as you type (debounced)
              and drives the server-side search — see handleSearchChange
              above. On the per-site panel (liveSearch=false), typing
              filters this already-loaded list entirely in the browser
              instead — no navigation, so the site you're editing (and
              its header/nav) never changes; click a row to actually jump
              to it. */}
          {liveSearch ? (
            <input
              type="text"
              name="q"
              defaultValue={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search owner or site"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            />
          ) : (
            <input
              type="text"
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              placeholder="Filter this list"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            />
          )}

          {/* Status and sort filters share one row now — both are
              single-choice dropdowns of similar weight, so there's no
              reason for one to sit above the other. */}
          <div className="flex gap-1.5">
            {/* 2026-08-19, direct request — replaces a plain "Show
                archived" checkbox with a real status filter. Empty (the
                default) means everything except Archived, same as the
                checkbox's own default did; any specific status can now be
                picked to see just that one instead of it only ever being
                all-or-nothing.
                Sets a cookie rather than submitting a form (2026-08-19,
                second pass) — a URL param reset to the default every time
                a specific site was opened, since that page's own copy of
                this list never carried it through. Deliberately not the
                same fully-client-side approach used for Sort below,
                though: this genuinely changes which sites the server
                fetches, and with this list expected to grow into the
                hundreds, always fetching everything just to filter it in
                the browser doesn't scale the way re-sorting an
                already-fetched page does. The cookie is read server-side
                (see sitesStatusFilter.ts) by both this page and the
                site-detail page's own copy, so the database query itself
                stays properly filtered no matter which one you're on. */}
            <select
              defaultValue={status}
              onChange={(e) => {
                document.cookie = `${SITES_STATUS_FILTER_COOKIE}=${e.target.value}; path=/; max-age=31536000`;
                router.refresh();
              }}
              className="w-1/2 min-w-0 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            >
              <option value="">All except Archived</option>
              <option value="DRAFT">Draft</option>
              <option value="LIVE">Live</option>
              <option value="PAUSED">Paused</option>
              <option value="ISYT">ISYT</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              value={clientSort}
              onChange={(e) => handleSortChange(e.target.value as SortValue)}
              className="w-1/2 min-w-0 rounded-md border border-neutral-300 px-1.5 py-1.5 text-xs"
            >
              <option value="owner">Sort: Owner</option>
              <option value="date">Sort: Date</option>
              <option value="payment">Sort: Payment</option>
            </select>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-neutral-400">
          {visibleSites.length} site{visibleSites.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visibleSites.length === 0 ? (
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
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-xs text-neutral-800 ${
                      active ? "bg-[#E7E7E7]" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{site.ownerName}</span>
                      {site.name !== site.ownerName && (
                        <span className="text-neutral-400">
                          {" "}
                          — {site.name}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {isPinned && (
                        <span className="text-[10px] text-neutral-400">Recent</span>
                      )}
                      {/* 2026-08-18, direct request — added alongside the
                          new "Sort: Payment" option, so sorting by it
                          shows what it actually grouped by rather than a
                          silent, unlabelled reshuffle. Shown regardless of
                          which sort is active, same as Archived/Recent. */}
                      {site.paymentMethod && (
                        <span className="text-[10px] text-neutral-400">
                          {site.paymentMethod}
                        </span>
                      )}
                      {site.status === "ARCHIVED" && (
                        <span className="text-[10px] text-neutral-400">Archived</span>
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
