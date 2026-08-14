"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createArtwork, getArtworkDetailForClient, listArtworks } from "@/lib/actions/artworks";
import ArtworkImportPanel from "@/components/ArtworkImportPanel";
import ArtworkDetailPanel, {
  type ArtworkDetail,
  type ArtworkSettings,
} from "@/components/ArtworkDetailPanel";

type ArtworkRow = {
  id: string;
  presentationTitle: string;
  presentationPrice: string | null;
  catalogueNumber: string;
  availability: string;
  type: string | null;
  imageUrl: string | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:artworks-density";

export default function ArtworksCatalogueView({
  siteId,
  artistId,
  artworks: initialArtworks,
  total: initialTotal,
  soldCount: initialSoldCount,
  pageSize,
  q: initialQ,
  availability: initialAvailability,
  location: initialLocation,
  type: initialType,
  group: initialGroup,
  sort: initialSort,
  initialSelected,
  settings,
  siteDefaultCurrency = "GBP",
}: {
  siteId: string;
  artistId: string;
  artworks: ArtworkRow[];
  total: number;
  soldCount: number;
  pageSize: number;
  q: string;
  availability: string;
  location: string;
  type: string;
  group: string;
  sort: string;
  initialSelected: ArtworkDetail | null;
  settings: ArtworkSettings;
  siteDefaultCurrency?: string;
}) {
  const [view, setView] = useState<"tile" | "list">("tile");
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);
  const [showImport, setShowImport] = useState(false);
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
  const [sort, setSort] = useState(initialSort);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrlFilters = (next: {
    q: string;
    availability: string;
    location: string;
    type: string;
    group: string;
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
      sort: string;
    }>) => {
      const next = { q, availability, location, type, group, sort, ...overrides };
      const { rows, total: newTotal, soldCount: newSoldCount } = await listArtworks(artistId, {
        q: next.q || undefined,
        availability: next.availability || undefined,
        location: next.location || undefined,
        type: next.type || undefined,
        group: next.group || undefined,
        sort: next.sort || undefined,
        limit: pageSize,
      });
      setArtworks(
        rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          type: a.type,
          imageUrl: a.images[0]?.url ?? null,
        }))
      );
      setTotal(newTotal);
      setSoldCount(newSoldCount);
      updateUrlFilters(next);
    },
    [artistId, q, availability, location, type, group, sort, pageSize]
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
        sort: sort || undefined,
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [
        ...prev,
        ...rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          type: a.type,
          imageUrl: a.images[0]?.url ?? null,
        })),
      ]);
    } finally {
      setLoadingMore(false);
    }
  }, [artistId, artworks.length, q, availability, location, type, group, sort, pageSize]);

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
  // local state, fetching only the one clicked artwork.
  const [selected, setSelected] = useState<ArtworkDetail | null>(initialSelected);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const updateUrlSelected = (artworkId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (artworkId) params.set("selected", artworkId);
    else params.delete("selected");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const handleSelect = (artworkId: string) => {
    if (selectingId) return;
    setSelectingId(artworkId);
    (async () => {
      const item = await getArtworkDetailForClient(artworkId);
      if (item && item.artistId === artistId) {
        setSelected(item);
        updateUrlSelected(artworkId);
      }
      setSelectingId(null);
    })();
  };

  const handleClosePanel = () => {
    setSelected(null);
    updateUrlSelected(null);
  };

  const handleDeletedPanel = () => {
    if (selected) setArtworks((prev) => prev.filter((a) => a.id !== selected.id));
    setSelected(null);
    updateUrlSelected(null);
  };

  // After any save inside the panel — re-fetches this one artwork fresh
  // rather than relying on router.refresh(), which re-renders the server
  // tree but can't reach this already-mounted client state (2026-08-11;
  // see the matching note on ArtworkDetailPanel's onDataChanged prop).
  // Also patches the matching grid tile (2026-08-15 fix) — this used to
  // only update the open detail panel, so a saved field like Type never
  // showed up in the grid until a full page reload.
  const refreshSelected = () => {
    if (!selected) return;
    (async () => {
      const item = await getArtworkDetailForClient(selected.id);
      if (item && item.artistId === artistId) {
        setSelected(item);
        setArtworks((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  presentationTitle: item.presentationTitle,
                  presentationPrice: item.presentationPrice,
                  availability: item.availability,
                  type: item.type,
                  imageUrl: item.images[0]?.url ?? a.imageUrl,
                }
              : a
          )
        );
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

  const addNewTile = (
    <form action={createArtwork.bind(null, artistId, siteId)}>
      <button
        type="submit"
        className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + Add New
      </button>
    </form>
  );

  const loadMoreRow = hasMore && (
    <div ref={sentinelRef} className="mt-4 flex h-8 items-center justify-center">
      {loadingMore && <span className="text-sm text-neutral-400">Loading…</span>}
    </div>
  );

  return (
    <div className="px-6 py-4">
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "1fr 480px" }}>
        <div>
          {/* Row 1: title + view controls, together since they both govern
              how the whole catalogue displays. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">Artwork Catalogue</h1>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Import from CSV
              </button>

              <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
                <button
                  type="button"
                  onClick={() => setView("tile")}
                  className={`px-3 py-1.5 ${
                    view === "tile" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  Tile
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`px-3 py-1.5 ${
                    view === "list" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  List
                </button>
              </div>

              {view === "tile" && (
                <div className="flex items-center gap-1 text-sm text-neutral-500">
                  <span>Per row</span>
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
              the view controls above. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAvailability("");
                  applyFilters({ availability: "" });
                }}
                className={`rounded-full px-3 py-1.5 text-sm ${
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
                className={`rounded-full px-3 py-1.5 text-sm ${
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
                className={`rounded-full px-3 py-1.5 text-sm ${
                  availability === "SOLD"
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                Sold
              </button>
            </div>

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
                className="w-44 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <select
                name="location"
                value={location}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocation(v);
                  applyFilters({ location: v });
                }}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
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
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
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
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
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
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
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
                    {a.presentationTitle}
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
                  <th className="py-2 font-medium">Title</th>
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
                    <td className="py-2 font-medium text-neutral-900">{a.presentationTitle}</td>
                    <td className="py-2 text-neutral-500">{a.catalogueNumber}</td>
                    <td className="py-2 text-neutral-500">
                      {a.presentationPrice ? `£${a.presentationPrice}` : "—"}
                    </td>
                    <td className="py-2 text-neutral-500">{a.availability}</td>
                  </tr>
                ))}
                <tr className="border-b border-neutral-100">
                  <td colSpan={5} className="py-2">
                    <form action={createArtwork.bind(null, artistId, siteId)}>
                      <button
                        type="submit"
                        className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
                      >
                        + Add New
                      </button>
                    </form>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {loadMoreRow}
        </div>

        <div className="sticky top-4">
          {selected ? (
            <ArtworkDetailPanel
              key={selected.id}
              siteId={siteId}
              artistId={artistId}
              artwork={selected}
              settings={settings}
              siteDefaultCurrency={siteDefaultCurrency}
              onClose={handleClosePanel}
              onDeleted={handleDeletedPanel}
              onDataChanged={refreshSelected}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
              Select an artwork to see its details.
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ArtworkImportPanel
          artistId={artistId}
          siteId={siteId}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
