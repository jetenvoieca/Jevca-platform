"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import AddIconButton from "@/components/AddIconButton";
import { useRouter } from "next/navigation";
import { listMedia, getMediaDetail, deleteMediaItems } from "@/lib/actions/mediaCatalogue";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";
import VideoThumb from "@/components/VideoThumb";
import MediaCatalogueTabs from "@/components/MediaCatalogueTabs";
import { mediaListFilters, type MediaTab } from "@/lib/mediaTabs";
import { useClientWords } from "@/components/ClientWordsProvider";

type MediaRow = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  caption: string | null;
  artwork: { id: string; catalogueName: string } | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:media-density";

// Debounce for the search box, so "filters activate as you type"
// (2026-09-12, direct request) doesn't fire a navigation on every
// keystroke.
const SEARCH_DEBOUNCE_MS = 400;

// Reads the URL bar directly, bypassing Next's router, so bookmarking or
// refreshing on a selected item still works without every click paying
// for a full server round-trip (2026-08-08 perf pass — see below).
function updateUrlSelected(mediaId: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (mediaId) params.set("selected", mediaId);
  else params.delete("selected");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export default function MediaCatalogueView({
  siteId,
  artistId,
  media,
  total,
  pageSize,
  purpose,
  q,
  tag,
  artworkId,
  counts,
  tagPresets,
  artistArtworks,
  initialSelected,
}: {
  siteId: string;
  artistId: string;
  media: MediaRow[];
  total: number;
  pageSize: number;
  purpose: Exclude<MediaTab, "artworks">;
  q: string;
  tag: string;
  artworkId: string;
  counts: { marketing: number; related: number };
  tagPresets: string[];
  artistArtworks: { id: string; catalogueName: string }[];
  initialSelected: MediaDetail | null;
}) {
  const words = useClientWords();
  const router = useRouter();
  const [view, setView] = useState<"tile" | "list">("tile");
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);

  // The visible list, appended to by "Load more". Previously assumed a
  // purpose/filter change was always "a real page load, which remounts
  // this component with fresh props" — wrong: the Marketing/Related
  // toggle and filters navigate via <Link>/router.push, which in the
  // Next.js App Router updates this component's props in place without
  // remounting it, so useState(media)'s initial value was only ever
  // applied once, on first mount. Switching tabs or filters then left
  // `items` frozen at whatever was last loaded, which is what made
  // switching tabs look like it "didn't work" without a manual browser
  // refresh — and separately explains the reported "43 of 9" count: total
  // (a plain prop) updated correctly and immediately on every navigation,
  // while items stayed stale, so the two fell out of sync (2026-08-17).
  const [items, setItems] = useState<MediaRow[]>(media);
  useEffect(() => {
    setItems(media);
  }, [media]);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < total;

  // Selecting an item no longer navigates to a separate route. Previously
  // clicking a tile went to /media/[mediaId], which re-ran the ENTIRE
  // catalogue query (every filtered row, unpaginated) plus three other
  // queries, just to also fetch the one clicked item — confirmed as the
  // real cause of the 3-5 second "whole page reloads" symptom reported
  // 2026-08-08. Selection is now local state, fetching only the one
  // clicked item via a direct, lightweight server-action call.
  const [selected, setSelected] = useState<MediaDetail | null>(initialSelected);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Select → Delete (2026-10-15, direct request — clearing out images
  // and videos that won't be used). While selecting, a click ticks an
  // item instead of opening it.
  const [selectMode, setSelectMode] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleTicked = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const leaveSelectMode = () => {
    setSelectMode(false);
    setTicked(new Set());
  };

  const handleDeleteTicked = async () => {
    const count = ticked.size;
    if (count === 0) return;
    if (!confirm(`Permanently delete ${count} item${count === 1 ? "" : "s"}? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    const { failed } = await deleteMediaItems(artistId, siteId, Array.from(ticked));
    const failedIds = new Set(failed.map((f) => f.id));
    setItems((prev) => prev.filter((m) => !ticked.has(m.id) || failedIds.has(m.id)));
    setDeleteError(
      failed.length > 0
        ? `${failed.length} item${failed.length === 1 ? "" : "s"} couldn't be deleted — still linked elsewhere (e.g. a catalogue entry's main image). Remove that link first.`
        : null
    );
    setDeleting(false);
    leaveSelectMode();
    router.refresh();
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

  // Live filters (2026-09-12, direct request — "filters should activate
  // as you type, so remove button") — replaces the old GET-form-plus-
  // Apply-button. Search stays local state (qInput) so the box feels
  // instant while typing, debounced before it actually navigates;
  // tag/artwork navigate immediately on change, since picking an option
  // is already a single deliberate action with nothing to debounce.
  // Reads the *current* URL for anything not being changed (rather than
  // only the q/tag/artworkId props) so it never drops an unrelated
  // param — "selected", for instance, is tracked outside these props
  // entirely, via updateUrlSelected above.
  //
  // Sort dropdown removed (2026-09-12, direct request — "never used it
  // or even know why I would") along with this function's own sort
  // handling; results are always Date added order now, same as the
  // dropdown's own default.
  const applyFilters = (overrides: { q?: string; tag?: string; artworkId?: string }) => {
    const params = new URLSearchParams(window.location.search);
    params.set("purpose", purpose);

    const nextQ = overrides.q ?? q;
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");

    if (purpose !== "related") {
      const nextTag = overrides.tag ?? tag;
      if (nextTag) params.set("tag", nextTag);
      else params.delete("tag");
      params.delete("artworkId");
    } else {
      const nextArtworkId = overrides.artworkId ?? artworkId;
      if (nextArtworkId) params.set("artworkId", nextArtworkId);
      else params.delete("artworkId");
      params.delete("tag");
    }

    router.push(`/sites/${siteId}/media?${params.toString()}`);
  };

  const [qInput, setQInput] = useState(q);
  // Keeps the box in sync with the URL on browser back/forward, or if a
  // pending debounce from a stale keystroke is still in flight when a
  // fresh `q` prop lands.
  useEffect(() => {
    setQInput(q);
  }, [q]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setQInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      applyFilters({ q: value });
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = (mediaId: string) => {
    if (selectingId) return;
    setSelectingId(mediaId);
    (async () => {
      const item = await getMediaDetail(mediaId);
      if (item && item.artistId === artistId) {
        setSelected({
          id: item.id,
          url: item.url,
          displayUrl: item.displayUrl,
          posterUrl: item.posterUrl,
          kind: item.kind,
          caption: item.caption,
          altText: item.altText,
          tags: item.tags,
          artworkId: item.artworkId,
          artwork: item.artwork,
        });
        updateUrlSelected(mediaId);
      }
      setSelectingId(null);
    })();
  };

  const handleClose = () => {
    setSelected(null);
    updateUrlSelected(null);
  };

  // After a save inside the panel — re-fetches this one item fresh
  // rather than relying on router.refresh(), which re-renders the server
  // tree but can't reach this already-mounted client state. Found and
  // fixed on the Artwork Catalogue 2026-08-11 (a saved field could
  // appear to silently revert); same underlying cause applies here.
  const refreshSelected = () => {
    if (!selected) return;
    (async () => {
      const item = await getMediaDetail(selected.id);
      if (item && item.artistId === artistId) {
        setSelected({
          id: item.id,
          url: item.url,
          displayUrl: item.displayUrl,
          posterUrl: item.posterUrl,
          kind: item.kind,
          caption: item.caption,
          altText: item.altText,
          tags: item.tags,
          artworkId: item.artworkId,
          artwork: item.artwork,
        });
      }
    })();
  };

  const handleArchived = () => {
    if (selected) setItems((prev) => prev.filter((m) => m.id !== selected.id));
    setSelected(null);
    updateUrlSelected(null);
  };

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    (async () => {
      try {
        const { rows } = await listMedia(artistId, {
          ...mediaListFilters(purpose),
          q: q || undefined,
          tag: tag || undefined,
          artworkId: artworkId || undefined,
          offset: items.length,
          limit: pageSize,
        });
        setItems((prev) => [
          ...prev,
          ...rows.map((m) => ({
            id: m.id,
            url: m.url,
            posterUrl: m.posterUrl,
            kind: m.kind,
            caption: m.caption,
            artwork: m.artwork,
          })),
        ]);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [artistId, purpose, q, tag, artworkId, items.length, pageSize]);

  // Infinite scroll (2026-08-13, matching the same change on the Artwork
  // Catalogue) — an invisible sentinel below the last row auto-triggers
  // the next page as it enters view, rather than requiring a "Load more"
  // click.
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
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, handleLoadMore]);

  return (
    <div className="px-6 py-4">
      <div>
        {/* Sticky, per the standing "fixed headers, independently-
            scrolling columns" layout rule (2026-08-03). */}
        <div className="sticky top-0 z-10 -mt-4 space-y-3 border-b border-neutral-200 bg-white pb-3 pt-4">
        {/* Row 1: title + view controls — same pattern as the Artwork
            Catalogue, both govern how the whole catalogue displays. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ⊞ goes to the Hopper (2026-08-19), the one way media comes in
              (see hopper-design.md) — the standard add icon since
              2026-10-28. */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>
            {!selectMode && <AddIconButton label="Add pictures or videos" href={`/sites/${siteId}/hopper`} />}
          </div>

          <div className="flex items-center gap-3">
            {selectMode ? (
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setTicked(
                      ticked.size === items.length ? new Set() : new Set(items.map((m) => m.id))
                    )
                  }
                  className="text-neutral-500 hover:text-neutral-900 hover:underline"
                >
                  {ticked.size === items.length ? "Select none" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTicked}
                  disabled={ticked.size === 0 || deleting}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : `Delete (${ticked.size})`}
                </button>
                <button
                  type="button"
                  onClick={leaveSelectMode}
                  disabled={deleting}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Select
              </button>
            )}
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

            {/* "Per row" label removed (2026-09-12, direct request) —
                the buttons' own numbers already say what they do; the
                Artwork Catalogue's matching density control has never
                had a label either. */}
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

        {/* Row 2: Marketing/Related toggle + filtering. Plain div, not a
            <form>, now that filters apply live (2026-09-12) rather than
            on submit — see applyFilters/handleSearchChange above. */}
        <div className="flex flex-wrap items-center gap-3">
          <MediaCatalogueTabs siteId={siteId} current={purpose} relatedCount={counts.related} />

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={qInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search caption, alt text"
              className="w-44 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            />
            {purpose !== "related" ? (
              <select
                value={tag}
                onChange={(e) => applyFilters({ tag: e.target.value })}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">All tags</option>
                {tagPresets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={artworkId}
                onChange={(e) => applyFilters({ artworkId: e.target.value })}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">All {words.items.toLowerCase()}</option>
                {artistArtworks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.catalogueName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        </div>

        {deleteError && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{deleteError}</p>
        )}
        <p className="mb-3 mt-3 text-sm text-neutral-400">
          {items.length} of {total} item{total === 1 ? "" : "s"}
        </p>

        {view === "tile" ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
          >
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => (selectMode ? toggleTicked(m.id) : handleSelect(m.id))}
                disabled={selectingId === m.id}
                className={`relative block w-full rounded-md border-2 p-1 text-left ${
                  (selectMode ? ticked.has(m.id) : selected?.id === m.id)
                    ? "border-neutral-900"
                    : "border-transparent"
                } ${selectingId === m.id ? "opacity-60" : ""}`}
              >
                {selectMode && <TickMark on={ticked.has(m.id)} />}
                {m.kind === "VIDEO" ? (
                  <div className="relative">
                    {m.posterUrl ? (
                      <img
                        src={m.posterUrl}
                        alt=""
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ) : (
                      <VideoThumb
                        src={m.url}
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    )}
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      ▶ Video
                    </span>
                  </div>
                ) : (
                  <img
                    src={m.url}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                )}
                <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                  {m.caption || "Untitled"}
                </p>
                {m.artwork && (
                  <p className="truncate text-xs font-medium text-rose-600">
                    → {m.artwork.catalogueName}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 font-medium"></th>
                <th className="py-2 font-medium">Caption</th>
                <th className="py-2 font-medium">Kind</th>
                <th className="py-2 font-medium">Related {words.item}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => (selectMode ? toggleTicked(m.id) : handleSelect(m.id))}
                  className={`cursor-pointer border-b border-neutral-100 ${
                    (selectMode ? ticked.has(m.id) : selected?.id === m.id)
                      ? "bg-neutral-100"
                      : "hover:bg-neutral-50"
                  } ${selectingId === m.id ? "opacity-60" : ""}`}
                >
                  <td className="relative w-12 py-2">
                    {selectMode && <TickMark on={ticked.has(m.id)} />}
                    {m.kind === "VIDEO" ? (
                      m.posterUrl ? (
                        <img
                          src={m.posterUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <VideoThumb src={m.url} className="h-10 w-10 rounded object-cover" />
                      )
                    ) : (
                      <img src={m.url} alt="" className="h-10 w-10 rounded object-cover" />
                    )}
                  </td>
                  <td className="py-2 font-medium text-neutral-900">{m.caption || "Untitled"}</td>
                  <td className="py-2 text-neutral-500">{m.kind === "VIDEO" ? "Video" : "Photo"}</td>
                  <td className="py-2 text-rose-600">
                    {m.artwork ? m.artwork.catalogueName : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hasMore && (
          <div ref={sentinelRef} className="mt-4 flex h-8 items-center justify-center">
            {loadingMore && <span className="text-sm text-neutral-400">Loading…</span>}
          </div>
        )}
      </div>

      {/* Details panel is a modal (2026-09-12, direct request) — it used
          to live permanently docked in a second grid column. Centered,
          same positioning as the Artwork Catalogue's own modal
          (ArtworksCatalogueView.tsx), not docked to a side. Clicking the
          backdrop closes it; the panel itself stops that click from
          bubbling so clicks inside it don't close it. */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
          onClick={handleClose}
        >
          <div
            className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <MediaDetailPanel
              key={selected.id}
              siteId={siteId}
              media={selected}
              tagPresets={tagPresets}
              onClose={handleClose}
              onArchived={handleArchived}
              onDataChanged={refreshSelected}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// The tick on an item while selecting.
function TickMark({ on }: { on: boolean }) {
  return (
    <span
      className={`absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
        on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white/80 text-transparent"
      }`}
    >
      ✓
    </span>
  );
}
