"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  getArtworkDetailForClient,
  listArtworks,
  listArtworkNames,
  deleteArtworkIfBlank,
  type ArtworkListRow,
} from "@/lib/actions/artworks";
import type { CurationSummary } from "@/lib/actions/curations";
import ArtworkImportPanel from "@/components/ArtworkImportPanel";
import ArtworkDetailPanel, {
  type ArtworkDetail,
  type ArtworkSettings,
} from "@/components/ArtworkDetailPanel";
import { artworkMatchesFilters } from "@/lib/artworkFilters";
import ExportPdfDialog from "@/components/ExportPdfDialog";
import ArtworkFilterBar from "@/components/ArtworkFilterBar";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { useClientWords } from "@/components/ClientWordsProvider";

// Every filter the catalogue offers, in one shape — what the URL, the
// grid fetches and the PDF/CSV exports all read from.
type Filters = {
  name: string;
  availability: string;
  location: string;
  type: string;
  curation: string;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:artworks-density";

// Availability now has three real values — AVAILABLE, RESERVED ("Sold -
// Not Paid"), SOLD (2026-09-20 rebuild, see the "Availability model"
// note in lib/actions/payments.ts). This is the one place that maps the
// raw value to what the grid actually shows, so the tile ribbon and the
// list view's Availability column can't drift out of sync with each
// other.
function formatAvailability(value: string): string {
  if (value === "SOLD") return "SOLD";
  if (value === "RESERVED") return "Sold - Not Paid";
  return "Available";
}

// Only the filters actually set, as the query-string pairs the URL and
// the export routes expect.
function activeFilterParams(filters: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) out[key] = value;
  }
  return out;
}

// The same filters as listArtworks takes them — unset ones left out.
function toListFilters(filters: Filters) {
  return {
    name: filters.name || undefined,
    availability: filters.availability || undefined,
    location: filters.location || undefined,
    type: filters.type || undefined,
    curation: filters.curation || undefined,
  };
}

export default function ArtworksCatalogueView({
  siteId,
  basePath,
  artistId,
  artistName,
  artworks: initialArtworks,
  total: initialTotal,
  soldCount: initialSoldCount,
  pageSize,
  name: initialName,
  names: initialNames,
  availability: initialAvailability,
  location: initialLocation,
  type: initialType,
  curation: initialCuration = "",
  curations = [],
  initialSelected,
  settings,
}: {
  siteId: string;
  // Where this view's own in-page links (currently just "+ Add New" ->
  // Add Artworks) should point. Defaults to the real site's own admin path so
  // every existing caller is unaffected; the evaluation-only reduced
  // menu (see previewSites.ts) passes its own basePath instead, so that
  // link stays inside that reduced shell rather than jumping out to the
  // full admin one (2026-09-12).
  basePath?: string;
  artistId: string;
  artistName: string;
  artworks: ArtworkListRow[];
  total: number;
  soldCount: number;
  pageSize: number;
  // The Name dropdown (2026-10-13): the chosen name, and every artwork
  // name to choose from.
  name: string;
  names: string[];
  availability: string;
  location: string;
  type: string;
  // Curation filter (2026-09-24) — a Curation's id, and the list the
  // dropdown offers. Optional so the evaluation-only preview pages
  // (which don't have Curations yet) need no change; with no curations
  // passed, the dropdown isn't shown.
  curation?: string;
  curations?: CurationSummary[];
  initialSelected: ArtworkDetail | null;
  settings: ArtworkSettings;
}) {
  const resolvedBasePath = basePath ?? `/sites/${siteId}`;
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
  const words = useClientWords();
  const [artworks, setArtworks] = useState<ArtworkListRow[]>(initialArtworks);
  const [total, setTotal] = useState(initialTotal);
  const [soldCount, setSoldCount] = useState(initialSoldCount);
  const [loadingMore, setLoadingMore] = useState(false);
  // Set when a "load more" fetch fails (2026-09-13 fix, direct report —
  // "loading sign keeps flickering, console errors every second or so").
  // Without this, a failed fetch just reset loadingMore back to false
  // with no new rows added, so hasMore stayed true, the sentinel was
  // still on-screen, and the IntersectionObserver immediately fired
  // handleLoadMore() again — an infinite retry loop hammering the server
  // with the same failing request, which is exactly what the flicker and
  // repeated console errors were. The observer effect below now skips
  // auto-fetching while this is true; loadMoreRow shows a manual
  // "Couldn't load more — Retry" instead of "Loading…", and retrying (or
  // any successful load/filter change) clears it.
  const [loadMoreError, setLoadMoreError] = useState(false);
  const hasMore = artworks.length < total;

  // Filters (2026-08-15) — used to be a plain <form method="get"> needing
  // an explicit Apply click, causing a full page reload. Now client
  // state, fetched the same way "load more" already works below —
  // applies the moment you click a chip or change a dropdown, no
  // separate step, and the URL still updates (via replaceState, not a
  // navigation) so filters stay bookmarkable/shareable.
  const [name, setName] = useState(initialName);
  const [names, setNames] = useState(initialNames);
  // All or Sold (2026-10-17 — "Available" removed); an old link asking
  // for Available shows All.
  const [availability, setAvailability] = useState(initialAvailability === "SOLD" ? "SOLD" : "");
  const [location, setLocation] = useState(initialLocation);
  const [type, setType] = useState(initialType);
  const [curation, setCuration] = useState(initialCuration);

  // The Name list changes when a work is renamed, duplicated or deleted.
  const refreshNames = () => {
    listArtworkNames(artistId).then(setNames);
  };

  const currentFilters: Filters = { name, availability, location, type, curation };

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

  // Sort dropdown removed (2026-09-12, direct request — "never used it
  // or even know why I would"), same as its counterpart on the Media
  // Catalogue. listArtworks (and the CSV/PDF exports, which share the
  // same filters) always use the one shared order (buildArtworkOrderBy,
  // lib/artworkFilters.ts).
  const updateUrlFilters = (next: Filters) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const applyFilters = useCallback(
    async (overrides: Partial<Filters>) => {
      const next: Filters = { name, availability, location, type, curation, ...overrides };
      const { rows, total: newTotal, soldCount: newSoldCount } = await listArtworks(artistId, {
        ...toListFilters(next),
        limit: pageSize,
      });
      setArtworks(rows);
      setTotal(newTotal);
      setSoldCount(newSoldCount);
      // Fresh list under the new filters — any previous "load more"
      // failure no longer applies to it.
      setLoadMoreError(false);
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
    [artistId, name, availability, location, type, curation, pageSize, selected]
  );

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const { rows } = await listArtworks(artistId, {
        ...toListFilters({ name, availability, location, type, curation }),
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [...prev, ...rows]);
    } catch {
      // See the note on loadMoreError above — this is what actually
      // breaks the retry loop: without catching here, the error would
      // propagate as an unhandled rejection and the observer effect
      // below would just fire handleLoadMore() again on the very next
      // tick, forever.
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [artistId, artworks.length, name, availability, location, type, curation, pageSize]);

  // Infinite scroll: an invisible sentinel sits just past the last row.
  // When it enters the viewport we auto-fetch the next page — no "Load
  // more" button, so scrolling reads as one continuous list rather than
  // a series of manual steps (feedback 2026-08-12: a visible button felt
  // like a template/Wix pattern, not the tighter feel wanted here).
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    // Also skipped while loadMoreError is true (2026-09-13 fix) — the
    // sentinel can still be sitting on-screen after a failed fetch (no
    // new rows arrived, so hasMore is still true), but auto-retrying it
    // here is exactly the infinite loop this fix removes. Loading more
    // after a failure now only happens via the explicit Retry button in
    // loadMoreRow below.
    if (!node || !hasMore || loadMoreError) return;
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
  }, [hasMore, loadingMore, loadMoreError, handleLoadMore]);

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
  const panelBackdrop = useBackdropClose(handleClosePanel);

  const handleDeletedPanel = () => {
    if (selected) setArtworks((prev) => prev.filter((a) => a.id !== selected.id));
    refreshNames();
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
  // filters (e.g. Sold is showing and the derivative isn't sold).
  const handleDuplicated = (newArtworkId: string) => {
    (async () => {
      const { rows, total: newTotal, soldCount: newSoldCount } = await listArtworks(artistId, {
        ...toListFilters(currentFilters),
        limit: pageSize,
      });
      setArtworks(rows);
      setTotal(newTotal);
      setSoldCount(newSoldCount);
      setLoadMoreError(false);
      refreshNames();
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
        refreshNames();

        const stillMatches = artworkMatchesFilters(item, currentFilters);

        if (stillMatches) {
          setArtworks((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? {
                    ...a,
                    catalogueName: item.catalogueName,
                    presentationPrice: item.presentationPrice,
                    availability: item.availability,
                    type: item.type,
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
          ...toListFilters(currentFilters),
          limit: 0,
        });
        setTotal(freshTotal);
        setSoldCount(freshSoldCount);
      }
    })();
  };

  // One layout button (2026-10-17, direct request — less clutter for
  // something rarely changed): each click goes to the next of tiles 3, 5,
  // 7 and 9 to a row, then the list, then back. Remembered on this
  // browser ("list" or the number per row).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
      if (stored === "list") {
        setView("list");
        return;
      }
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (DENSITY_OPTIONS.includes(parsed as (typeof DENSITY_OPTIONS)[number])) {
        setDensity(parsed as (typeof DENSITY_OPTIONS)[number]);
      }
    } catch {
      // No storage here — the default layout stays.
    }
  }, []);

  const nextLayout = () => {
    const at = DENSITY_OPTIONS.indexOf(density);
    const toList = view === "tile" && at === DENSITY_OPTIONS.length - 1;
    const nextDensity = view === "list" ? DENSITY_OPTIONS[0] : DENSITY_OPTIONS[Math.min(at + 1, DENSITY_OPTIONS.length - 1)];
    setView(toList ? "list" : "tile");
    if (!toList) setDensity(nextDensity);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, toList ? "list" : String(nextDensity));
    } catch {
      // Not remembered — fine.
    }
  };

  // Builds the CSV export URL from whatever filters are currently active
  // — same query-param shape as the PDF export below, minus the
  // header-title fields that dialog adds (a CSV has no printed header to
  // customise).
  const buildCsvExportUrl = () => {
    const params = new URLSearchParams({
      artistId,
      ...activeFilterParams(currentFilters),
    });
    return `/api/artwork-catalogue-csv?${params.toString()}`;
  };

  // Goes to "Add Artworks" (2026-10-15) — the Hopper narrowed to adding
  // artworks and their ancillary images (see HopperView's artworkIntake),
  // rather than creating a blank row directly. Uses resolvedBasePath (2026-09-12) rather than a
  // hardcoded /sites/${siteId} so this stays inside the evaluation
  // reduced-menu shell when rendered there.
  const addNewTile = (
    <Link
      href={`${resolvedBasePath}/artworks/add`}
      className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
    >
      + Add New
    </Link>
  );

  const loadMoreRow = hasMore && (
    <div ref={sentinelRef} className="mt-4 flex h-8 items-center justify-center">
      {loadingMore ? (
        <span className="text-sm text-neutral-400">Loading…</span>
      ) : loadMoreError ? (
        <button
          type="button"
          onClick={handleLoadMore}
          className="text-sm text-red-600 hover:underline"
        >
          Couldn't load more — tap to retry
        </button>
      ) : null}
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
            how the whole catalogue displays: PDF, CSV and the layout button.
            All/Sold is in the filter row below (2026-10-17, direct
            request — "Available" removed). "Export PDF"/"Import from
            CSV" shortened to "PDF"/"CSV" (2026-09-11, direct request) — CSV now opens a small
            Import/Export choice rather than going straight into the
            importer, since it covers both directions. Button/field
            heights cut ~20% throughout this row and the filter row
            below (2026-09-11, direct request — "catalogue will be a
            high usage area"), same treatment as the detail panel.
            "Sold" includes RESERVED ("Sold - Not Paid") works too
            (2026-09-24) — see SOLD_AVAILABILITIES in
            lib/artworkFilters.ts. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">{words.catalogue}</h1>

            <div className="flex items-center gap-3">
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

              <button
                type="button"
                onClick={nextLayout}
                title={view === "list" ? "List — click for tiles" : `${density} to a row — click to change`}
                aria-label="Change layout"
                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-[4.8px] text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {view === "list" ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <rect x="1" y="2" width="14" height="2" rx="0.5" />
                    <rect x="1" y="7" width="14" height="2" rx="0.5" />
                    <rect x="1" y="12" width="14" height="2" rx="0.5" />
                  </svg>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                      <rect x="1" y="1" width="6" height="6" rx="1" />
                      <rect x="9" y="1" width="6" height="6" rx="1" />
                      <rect x="1" y="9" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                    </svg>
                    {density}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: filtering — All/Sold, then the filters shared with the
              Media Catalogue's Artworks view (ArtworkFilterBar). */}
          <div className="mb-3">
            <ArtworkFilterBar
              before={
                <div className="flex gap-2">
                  {[
                    { value: "", label: "All" },
                    { value: "SOLD", label: "Sold" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setAvailability(option.value);
                        applyFilters({ availability: option.value });
                      }}
                      className={`rounded-full px-3 py-[4.8px] text-sm ${
                        availability === option.value
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              }
              values={{ curation, name, location, type }}
              curations={curations}
              names={names}
              locations={settings.locations.map((l) => l.name)}
              types={settings.artworkTypes}
              onChange={(change) => {
                if (change.curation !== undefined) setCuration(change.curation);
                if (change.name !== undefined) setName(change.name);
                if (change.location !== undefined) setLocation(change.location);
                if (change.type !== undefined) setType(change.type);
                applyFilters(change);
              }}
            />
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
                    {/* Includes RESERVED now (2026-09-20 rebuild) — a
                        "Sold - Not Paid" piece is just as unavailable to
                        browse as a fully SOLD one, so it gets a ribbon
                        too, just with different wording. */}
                    {(a.availability === "SOLD" || a.availability === "RESERVED") && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                        {a.availability === "SOLD" ? "Sold" : "Not Paid"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                    {a.catalogueName}
                  </p>
                  <p className="text-xs text-neutral-500">{a.type || "—"}</p>
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
                    <td className="py-2 text-neutral-500">{formatAvailability(a.availability)}</td>
                  </tr>
                ))}
                <tr className="border-b border-neutral-100">
                  <td colSpan={5} className="py-2">
                    <Link
                      href={`${resolvedBasePath}/artworks/add`}
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
          request; shared useBackdropClose since 2026-09-23). */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...panelBackdrop}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl">
            <ArtworkDetailPanel
              key={selected.id}
              siteId={siteId}
              basePath={resolvedBasePath}
              artistId={artistId}
              artwork={selected}
              settings={settings}
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
        defaultSubtitle={words.catalogue}
        onCancel={() => setShowExportDialog(false)}
        onExport={(headerTitle, headerSubtitle) => {
          setShowExportDialog(false);
          const url = `/api/artwork-catalogue-pdf?${new URLSearchParams({
            artistId,
            headerTitle,
            headerSubtitle,
            ...activeFilterParams(currentFilters),
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
