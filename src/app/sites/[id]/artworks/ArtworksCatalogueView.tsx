"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  getArtworkDetailForClient,
  listArtworks,
  deleteArtworkIfBlank,
} from "@/lib/actions/artworks";
import ArtworkImportPanel from "@/components/ArtworkImportPanel";
import ArtworkDetailPanel, {
  type ArtworkDetail,
  type ArtworkSettings,
} from "@/components/ArtworkDetailPanel";
import { artworkMatchesFilters } from "@/lib/artworkFilters";
import ExportPdfDialog from "@/components/ExportPdfDialog";

type ArtworkRow = {
  id: string;
  presentationTitle: string;
  catalogueName: string;
  presentationPrice: string | null;
  catalogueNumber: string;
  availability: string;
  type: string | null;
  catalogueGroup: string | null;
  imageUrl: string | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:artworks-density";

export default function ArtworksCatalogueView({
  siteId,
  artistId,
  artistName,
  artworks: initialArtworks,
  total: initialTotal,
  soldCount: initialSoldCount,
  pageSize,
  q: initialQ,
  availability: initialAvailability,
  location: initialLocation,
  type: initialType,
  group: initialGroup,
  tier: initialTier,
  sort: initialSort,
  initialSelected,
  settings,
  siteDefaultCurrency = "GBP",
}: {
  siteId: string;
  artistId: string;
  artistName: string;
  artworks: ArtworkRow[];
  total: number;
  soldCount: number;
  pageSize: number;
  q: string;
  availability: string;
  location: string;
  type: string;
  group: string;
  tier: string;
  sort: string;
  initialSelected: ArtworkDetail | null;
  settings: ArtworkSettings;
  siteDefaultCurrency?: string;
}) {
  const [view, setView] = useState<"tile" | "list">("tile");
  // Export PDF now opens a small dialog first (2026-08-17) rather than
  // being a plain download link, so the header title/subtitle can be
  // overridden just for this one export — see ExportPdfDialog.tsx.
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);
  const [showImport, setShowImport] = useState(false);
  // CSV now covers two directions — Import (existing ArtworkImportPanel)
  // and Export (new, direct download of the current filtered view) —
  // so the single "CSV" button opens a small choice popover instead of
  // going straight into the importer (2026-09-11, direct request).
  const [showCsvChoice, setShowCsvChoice] = useState(false);
  const [artworks, setArtworks] = useState<ArtworkRow[]>(initialArtworks);
  const [total, setTotal] = useState(initialTotal);
  const [soldCount, setSoldCount] = useState(initialSoldCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = artworks.length < total;

  // Filters (2026-08-15) — used to be a plain <form method="get"> needing
  // an explicit Apply click, causing a full page reload. Now client
  // state, fetched the same way "load more" already works below —
  // applies the moment you click a chip or change a dropdown, no
  // separate step, and the URL still updates (via replaceState, not a
  // navigation) so filters stay bookmarkable/shareable.
  const [q, setQ] = useState(initialQ);
  const [availability, setAvailability] = useState(initialAvailability);
  const [location, setLocation] = useState(initialLocation);
  const [type, setType] = useState(initialType);
  const [group, setGroup] = useState(initialGroup);
  const [tier, setTier] = useState(initialTier);
  const [sort, setSort] = useState(initialSort);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Declared up here, ahead of applyFilters below, specifically because
  // applyFilters' own dependency array reads `selected` directly
  // (2026-08-16 fix — closing the panel when a filter change takes the
  // open artwork out of view). A block-scoped variable referenced in a
  // dependency array has to already exist by the time that array is
  // evaluated during render, not just by the time the callback itself
  // runs later — declaring it after applyFilters compiled locally with
  // esbuild's plain syntax check (no such rule) but failed Next.js's
  // real TypeScript build with "used before its declaration". See the
  // fuller selection-related comment further down, by selectingId.
  const [selected, setSelected] = useState<ArtworkDetail | null>(initialSelected);

  const updateUrlFilters = (next: {
    q: string;
    availability: string;
    location: string;
    type: string;
    group: string;
    tier: string;
    sort: string;
  }) => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete("q", next.q);
    setOrDelete("availability", next.availability);
    setOrDelete("location", next.location);
    setOrDelete("type", next.type);
    setOrDelete("group", next.group);
    setOrDelete("tier", next.tier);
    setOrDelete("sort", next.sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const applyFilters = useCallback(
    async (overrides: Partial<{
      q: string;
      availability: string;
      location: string;
      type: string;
      group: string;
      tier: string;
      sort: string;
    }>) => {
      const next = { q, availability, location, type, group, tier, sort, ...overrides };
      const { rows, total: newTotal, soldCount: newSoldCount } = await listArtworks(artistId, {
        q: next.q || undefined,
        availability: next.availability || undefined,
        location: next.location || undefined,
        type: next.type || undefined,
        group: next.group || undefined,
        tier: next.tier || undefined,
        sort: next.sort || undefined,
        limit: pageSize,
      });
      setArtworks(
        rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          catalogueName: a.catalogueName,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          type: a.type,
          catalogueGroup: a.catalogueGroup,
          imageUrl: a.images[0]?.url ?? null,
        }))
      );
      setTotal(newTotal);
      setSoldCount(newSoldCount);
      updateUrlFilters(next);

      // 2026-08-16 fix: whatever was open in the detail panel used to
      // stay open regardless of a filter change, even once it no longer
      // matched — e.g. filter by a Location, open a work, then filter by
      // a *different* Location: the now-irrelevant work stayed sitting
      // open in the panel with no indication it wasn't part of the list
      // in front of it. Reuses the same artworkMatchesFilters check as
      // the "edit takes a tile outside the active filter" fix — closes
      // the panel only when the still-open artwork genuinely no longer
      // belongs under the new filters, leaves it alone otherwise.
      if (selected && !artworkMatchesFilters(selected, next)) {
        selectedIdRef.current = null;
        setSelected(null);
        updateUrlSelected(null);
      }
    },
    [artistId, q, availability, location, type, group, tier, sort, pageSize, selected]
  );

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { rows } = await listArtworks(artistId, {
        q: q || undefined,
        availability: availability || undefined,
        location: location || undefined,
        type: type || undefined,
        group: group || undefined,
        tier: tier || undefined,
        sort: sort || undefined,
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [
        ...prev,
        ...rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          catalogueName: a.catalogueName,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          type: a.type,
          catalogueGroup: a.catalogueGroup,
          imageUrl: a.images[0]?.url ?? null,
        })),
      ]);
    } finally {
      setLoadingMore(false);
    }
  }, [artistId, artworks.length, q, availability, location, type, group, tier, sort, pageSize]);

  // Infinite scroll: an invisible sentinel sits just past the last row.
  // When it enters the viewport we auto-fetch the next page — no "Load
  // more" button, so scrolling reads as one continuous list rather than
  // a series of manual steps (feedback 2026-08-12: a visible button felt
  // like a template/Wix pattern, not the tighter feel wanted here).
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          handleLoadMore();
        }
      },
      { rootMargin: "400px" }, // start fetching before the sentinel is actually on-screen, so new rows are ready by the time you scroll to them
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, handleLoadMore]);

  // Selecting an artwork used to navigate to a whole separate route,
  // which re-ran this component from scratch on every click — the direct
  // cause of the density flicker reported 2026-08-11 (density starts at
  // its default and only catches up to the real, stored value after a
  // fresh mount's effect runs), on top of being needlessly slow. Fixed
  // exactly like the same issue on Media Catalogue: selection is now
  // local state, fetching only the one clicked artwork. (`selected`
  // itself is declared further up, ahead of applyFilters — see the note
  // there.)
  const [selectingId, setSelectingId] = useState<string | null>(null);
  // Tracks which artwork is *currently* meant to be shown, independent of
  // any in-flight fetch (2026-08-15 fix). Without this, an autosave's
  // background refresh (refreshSelected, below) that's still in flight
  // when you click a different artwork can resolve afterwards and
  // clobber the new selection with the old artwork's data — the new
  // image would flash correctly for a moment, then silently revert.
  // A ref rather than state because it needs to be read synchronously
  // inside already-in-flight async closures, not just on the next
  // render.
  const selectedIdRef = useRef<string | null>(initialSelected?.id ?? null);

  const updateUrlSelected = (artworkId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (artworkId) params.set("selected", artworkId);
    else params.delete("selected");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const handleSelect = (artworkId: string) => {
    if (selectingId) return;
    // Quietly cleans up the artwork you're switching away from if it's
    // still exactly as it was when created (see deleteArtworkIfBlank) —
    // a no-op if you've actually added anything. Previously only ran
    // when explicitly clicking Close, which no longer exists here since
    // the grid stays visible regardless (2026-08-15) — this preserves
    // that safety net for an abandoned "+ Add New" without needing an
    // extra click. Fire-and-forget: no need to block switching on it.
    if (selected && selected.id !== artworkId) {
      deleteArtworkIfBlank(siteId, selected.id);
    }
    setSelectingId(artworkId);
    selectedIdRef.current = artworkId;
    (async () => {
      const item = await getArtworkDetailForClient(artworkId);
      // Only apply if this artwork is still the one actually wanted —
      // guards against this same fetch racing a *later* click's fetch,
      // as well as a lingering refreshSelected from before the switch.
      if (item && item.artistId === artistId && selectedIdRef.current === artworkId) {
        setSelected(item);
        updateUrlSelected(artworkId);
      }
      setSelectingId(null);
    })();
  };

  const handleClosePanel = () => {
    selectedIdRef.current = null;
    setSelected(null);
    updateUrlSelected(null);
  };

  const handleDeletedPanel = () => {
    if (selected) setArtworks((prev) => prev.filter((a) => a.id !== selected.id));
    selectedIdRef.current = null;
    setSelected(null);
    updateUrlSelected(null);
  };

  // After Create Derivative (2026-08-16) — refreshes the grid under the
  // current filters (so the new artwork shows up if it belongs there,
  // same as any other change) and opens it in the panel. Deliberately
  // NOT calling applyFilters for the refresh half of this: applyFilters
  // also closes the panel if the *currently selected* artwork falls
  // outside the active filters (see the note above it), which would
  // immediately close the very panel this is about to open for the new
  // derivative if the derivative doesn't happen to match the current
  // filters (e.g. Availability defaults to AVAILABLE regardless of what
  // the original's status was).
  const handleDuplicated = (newArtworkId: string) => {
    (async () => {
      const { rows, total: newTotal, soldCount: newSoldCount } = await listArtworks(artistId, {
        q: q || undefined,
        availability: availability || undefined,
        location: location || undefined,
        type: type || undefined,
        group: group || undefined,
        tier: tier || undefined,
        sort: sort || undefined,
        limit: pageSize,
      });
      setArtworks(
        rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          catalogueName: a.catalogueName,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          type: a.type,
          catalogueGroup: a.catalogueGroup,
          imageUrl: a.images[0]?.url ?? null,
        }))
      );
      setTotal(newTotal);
      setSoldCount(newSoldCount);
      handleSelect(newArtworkId);
    })();
  };

  // After any save inside the panel — re-fetches this one artwork fresh
  // rather than relying on router.refresh(), which re-renders the server
  // tree but can't reach this already-mounted client state (2026-08-11;
  // see the matching note on ArtworkDetailPanel's onDataChanged prop).
  // Also patches the matching grid tile (2026-08-15 fix) — this used to
  // only update the open detail panel, so a saved field like Type never
  // showed up in the grid until a full page reload.
  //
  // 2026-08-16 fix: patching in place isn't enough when the edited field
  // is itself one of the active filters (e.g. changing an artwork's
  // Location away from the Location filter's current value) — the tile
  // used to just sit there with its new value until a full page reload.
  // Now checks whether the saved artwork still belongs under the active
  // filters and drops the tile if not, and always refreshes total/
  // soldCount from the server (a cheap count-only call, no rows) so both
  // numbers stay correct regardless of whether the tile stayed, moved, or
  // was dropped. Deliberately doesn't touch the already-loaded rows
  // otherwise, so scrolling position from infinite scroll is preserved.
  const refreshSelected = () => {
    if (!selected) return;
    const idAtCallTime = selected.id;
    (async () => {
      const item = await getArtworkDetailForClient(idAtCallTime);
      // Same race guard as handleSelect above — if you've since clicked
      // a different artwork, this stale refresh must not overwrite it
      // (2026-08-15 fix).
      if (item && item.artistId === artistId && selectedIdRef.current === idAtCallTime) {
        setSelected(item);

        const stillMatches = artworkMatchesFilters(item, {
          q,
          availability,
          location,
          type,
          group,
          tier,
        });

        if (stillMatches) {
          setArtworks((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? {
                    ...a,
                    presentationTitle: item.presentationTitle,
                    catalogueName: item.catalogueName,
                    presentationPrice: item.presentationPrice,
                    availability: item.availability,
                    type: item.type,
                    catalogueGroup: item.catalogueGroup,
                    imageUrl: item.images[0]?.url ?? a.imageUrl,
                  }
                : a
            )
          );
        } else {
          setArtworks((prev) => prev.filter((a) => a.id !== item.id));
        }

        // Count-only fetch (limit: 0 — no rows, just the two count
        // queries) to keep the header's "X of Y works · Z sold" accurate,
        // since an edit can change soldCount even when the tile stays
        // (e.g. toggling Availability while filtered by something else).
        const { total: freshTotal, soldCount: freshSoldCount } = await listArtworks(artistId, {
          q: q || undefined,
          availability: availability || undefined,
          location: location || undefined,
          type: type || undefined,
          group: group || undefined,
          tier: tier || undefined,
          limit: 0,
        });
        setTotal(freshTotal);
        setSoldCount(freshSoldCount);
      }
    })();
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (DENSITY_OPTIONS.includes(parsed as (typeof DENSITY_OPTIONS)[number])) {
      setDensity(parsed as (typeof DENSITY_OPTIONS)[number]);
    }
  }, []);

  const setDensityAndStore = (n: (typeof DENSITY_OPTIONS)[number]) => {
    setDensity(n);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, String(n));
  };

  // Builds the CSV export URL from whatever filters are currently active
  // — same query-param shape as the PDF export below, minus the
  // header-title fields that dialog adds (a CSV has no printed header to
  // customise).
  const buildCsvExportUrl = () => {
    const params = new URLSearchParams({
      artistId,
      ...(q ? { q } : {}),
      ...(availability ? { availability } : {}),
      ...(location ? { location } : {}),
      ...(type ? { type } : {}),
      ...(group ? { group } : {}),
      ...(tier ? { tier } : {}),
      ...(sort ? { sort } : {}),
    });
    return `/api/artwork-catalogue-csv?${params.toString()}`;
  };

  // Goes straight to the Hopper now (2026-08-19, direct request) — the
  // Hopper is the primary way media gets into the Artwork Catalogue (see
  // hopper-design.md), so "add a new artwork" from here means starting
  // that flow, not creating a blank row directly. Previously created an
  // empty artwork via createArtwork and opened it in this panel; that
  // action is untouched and still used elsewhere, just not from this
  // button any more.
  const addNewTile = (
    <Link
      href={`/sites/${siteId}/hopper`}
      className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
    >
      + Add New
    </Link>
  );

  const loadMoreRow = hasMore && (
    <div ref={sentinelRef} className="mt-4 flex h-8 items-center justify-center">
      {loadingMore && <span className="text-sm text-neutral-400">Loading…</span>}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* pl-6 pr-6 (2026-09-10) — used to reserve pr-[504px] to line up
          with the detail panel's inline column + gap. That panel is now
          a modal (see below), so the grid runs the full width and the
          header no longer needs to leave space for it. */}
      <div className="shrink-0 px-6 pt-4">
        {/* Row 1: title + view controls, together since they both govern
            how the whole catalogue displays. All/Available/Sold moved
            here (2026-09-07, direct request) — in line with the
            "Artwork Catalogue" title, rather than sitting in the
            filter row below. Order within this cluster (2026-09-09
            correction) — All/Available/Sold, then PDF/CSV/Tile-List/
            density, matching the design mockup; this had been reversed.
            "Export PDF"/"Import from CSV" shortened to "PDF"/"CSV"
            (2026-09-11, direct request) — CSV now opens a small
            Import/Export choice rather than going straight into the
            importer, since it covers both directions. Button/field
            heights cut ~20% throughout this row and the filter row
            below (2026-09-11, direct request — "catalogue will be a
            high usage area"), same treatment as the detail panel. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">Artwork Catalogue</h1>

            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAvailability("");
                    applyFilters({ availability: "" });
                  }}
                  className={`rounded-full px-3 py-[4.8px] text-sm ${
                    !availability
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvailability("AVAILABLE");
                    applyFilters({ availability: "AVAILABLE" });
                  }}
                  className={`rounded-full px-3 py-[4.8px] text-sm ${
                    availability === "AVAILABLE"
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  Available
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvailability("SOLD");
                    applyFilters({ availability: "SOLD" });
                  }}
                  className={`rounded-full px-3 py-[4.8px] text-sm ${
                    availability === "SOLD"
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  Sold
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowExportDialog(true)}
                className="rounded-md border border-neutral-300 px-3 py-[4.8px] text-sm hover:bg-neutral-50"
              >
                PDF
              </button>

              {/* CSV — Import/Export choice popover (2026-09-11). A
                  plain relative wrapper + absolutely-positioned panel,
                  not a full modal (this is a two-option pick, not a
                  form) — closed by a transparent, unstyled click-catcher
                  behind it at the same fixed layer, same pattern as the
                  detail modal's backdrop-click-to-close elsewhere in
                  this file. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCsvChoice((v) => !v)}
                  className="rounded-md border border-neutral-300 px-3 py-[4.8px] text-sm hover:bg-neutral-50"
                >
                  CSV
                </button>
                {showCsvChoice && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowCsvChoice(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCsvChoice(false);
                          setShowImport(true);
                        }}
                        className="block w-full px-3 py-[6.4px] text-left text-sm hover:bg-neutral-50"
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCsvChoice(false);
                          window.open(buildCsvExportUrl(), "_blank");
                        }}
                        className="block w-full border-t border-neutral-100 px-3 py-[6.4px] text-left text-sm hover:bg-neutral-50"
                      >
                        Export
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
                <button
                  type="button"
                  onClick={() => setView("tile")}
                  className={`px-3 py-[4.8px] ${
                    view === "tile" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  Tile
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`px-3 py-[4.8px] ${
                    view === "list" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  List
                </button>
              </div>

              {view === "tile" && (
                <div className="flex items-center gap-1 text-sm text-neutral-500">
                  {DENSITY_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDensityAndStore(n)}
                      className={`h-7 w-7 rounded-md text-sm ${
                        density === n
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: filtering/search — a separate functional group from
              the view controls above. Tier (2026-09-07) sits leftmost,
              ahead of Search, matching the design mockup. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <select
              name="tier"
              value={tier}
              onChange={(e) => {
                const v = e.target.value;
                setTier(v);
                applyFilters({ tier: v });
              }}
              className="rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm"
            >
              <option value="">All tiers</option>
              {settings.artworkTiers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => {
                // Enter in the search box jumps the queue past the debounce
                // below, rather than waiting it out.
                e.preventDefault();
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                applyFilters({ q });
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                name="q"
                value={q}
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  searchDebounceRef.current = setTimeout(() => applyFilters({ q: v }), 350);
                }}
                placeholder="Search title, catalogue #, medium"
                className="w-44 rounded-md border border-neutral-300 px-3 py-[4.8px] text-sm"
              />
              <select
                name="location"
                value={location}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocation(v);
                  applyFilters({ location: v });
                }}
                className="rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm"
              >
                <option value="">All locations</option>
                {settings.artworkLocations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                name="type"
                value={type}
                onChange={(e) => {
                  const v = e.target.value;
                  setType(v);
                  applyFilters({ type: v });
                }}
                className="rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm"
              >
                <option value="">All types</option>
                {settings.artworkTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                name="group"
                value={group}
                onChange={(e) => {
                  const v = e.target.value;
                  setGroup(v);
                  applyFilters({ group: v });
                }}
                className="rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm"
              >
                <option value="">All groups</option>
                {settings.artworkGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                name="sort"
                value={sort}
                onChange={(e) => {
                  const v = e.target.value;
                  setSort(v);
                  applyFilters({ sort: v });
                }}
                className="rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm"
              >
                <option value="">Sort: Date added</option>
                <option value="title">Sort: Title</option>
                <option value="price">Sort: Price</option>
              </select>
            </form>
          </div>

          <p className="mb-3 text-sm text-neutral-400">
            {artworks.length} of {total} work{total === 1 ? "" : "s"} · {soldCount} sold
          </p>
      </div>

      {/* Grid now runs the full width (2026-09-10) — the detail panel
          used to sit alongside it in a fixed 480px column; it's a modal
          now (below), so there's nothing left to share this row with. */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
          {view === "tile" ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
            >
              {artworks.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelect(a.id)}
                  disabled={selectingId === a.id}
                  className={`block w-full rounded-md border-2 p-1 text-left ${
                    selected?.id === a.id ? "border-neutral-900" : "border-transparent"
                  } ${selectingId === a.id ? "opacity-60" : ""}`}
                >
                  <div className="relative">
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                    {a.availability === "SOLD" && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                        Sold
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                    {a.catalogueName}
                  </p>
                  <p className="text-xs text-neutral-500">{a.type || "—"}</p>
                  {a.catalogueGroup && (
                    <p className="truncate text-xs text-neutral-400">{a.catalogueGroup}</p>
                  )}
                </button>
              ))}
              {addNewTile}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 font-medium"></th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Catalogue #</th>
                  <th className="py-2 font-medium">Price</th>
                  <th className="py-2 font-medium">Availability</th>
                </tr>
              </thead>
              <tbody>
                {artworks.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => handleSelect(a.id)}
                    className={`cursor-pointer border-b border-neutral-100 ${
                      selected?.id === a.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    } ${selectingId === a.id ? "opacity-60" : ""}`}
                  >
                    <td className="py-2">
                      {a.imageUrl ? (
                        <img
                          src={a.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-neutral-100" />
                      )}
                    </td>
                    <td className="py-2 font-medium text-neutral-900">{a.catalogueName}</td>
                    <td className="py-2 text-neutral-500">{a.catalogueNumber}</td>
                    <td className="py-2 text-neutral-500">
                      {a.presentationPrice ? `£${a.presentationPrice}` : "—"}
                    </td>
                    <td className="py-2 text-neutral-500">{a.availability}</td>
                  </tr>
                ))}
                <tr className="border-b border-neutral-100">
                  <td colSpan={5} className="py-2">
                    <Link
                      href={`/sites/${siteId}/hopper`}
                      className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
                    >
                      + Add New
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {loadMoreRow}
      </div>

      {/* ---- Artwork detail modal (2026-09-10) ---- */}
      {/* Was a permanent 480px column next to the grid; the grid now
          runs full width regardless of whether anything is selected,
          and this opens as a modal on the same click (handleSelect)
          that used to just populate the column. ArtworkDetailPanel is
          unchanged — its own Duplicate/Delete/Close row still works
          exactly as before, just showCloseButton is now on (true)
          since Close is this modal's only way to dismiss it.
          Clicking the backdrop closes it too (2026-09-11, direct
          request) — the inner content stops that click from bubbling
          up, so clicking inside the modal itself never closes it. */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={handleClosePanel}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ArtworkDetailPanel
              key={selected.id}
              siteId={siteId}
              artistId={artistId}
              artwork={selected}
              settings={settings}
              siteDefaultCurrency={siteDefaultCurrency}
              onClose={handleClosePanel}
              onDeleted={handleDeletedPanel}
              onDuplicated={handleDuplicated}
              onDataChanged={refreshSelected}
              showCloseButton={true}
            />
          </div>
        </div>
      )}

      {showImport && (
        <ArtworkImportPanel
          artistId={artistId}
          siteId={siteId}
          onClose={() => setShowImport(false)}
        />
      )}

      <ExportPdfDialog
        open={showExportDialog}
        defaultTitle={artistName}
        defaultSubtitle="Artwork Catalogue"
        onCancel={() => setShowExportDialog(false)}
        onExport={(headerTitle, headerSubtitle) => {
          setShowExportDialog(false);
          const url = `/api/artwork-catalogue-pdf?${new URLSearchParams({
            artistId,
            headerTitle,
            headerSubtitle,
            ...(q ? { q } : {}),
            ...(availability ? { availability } : {}),
            ...(location ? { location } : {}),
            ...(type ? { type } : {}),
            ...(group ? { group } : {}),
            ...(tier ? { tier } : {}),
            ...(sort ? { sort } : {}),
          }).toString()}`;
          // Same as the plain link this replaces — a real navigation to
          // the download route, not a fetch+blob dance. window.open
          // rather than a plain href now that the trigger is a button
          // (opening the dialog first) instead of the link itself.
          window.open(url, "_blank");
        }}
      />
    </div>
  );
}
