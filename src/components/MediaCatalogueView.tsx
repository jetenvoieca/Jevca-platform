"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { uploadFileDirect } from "@/lib/uploadDirect";
import { listMedia, getMediaDetail } from "@/lib/actions/mediaCatalogue";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";
import VideoThumb from "@/components/VideoThumb";

type MediaRow = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  caption: string | null;
  artwork: { id: string; presentationTitle: string } | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:media-density";

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
  sort,
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
  purpose: "marketing" | "related";
  q: string;
  tag: string;
  artworkId: string;
  sort: string;
  counts: { marketing: number; related: number };
  tagPresets: string[];
  artistArtworks: { id: string; presentationTitle: string }[];
  initialSelected: MediaDetail | null;
}) {
  const [view, setView] = useState<"tile" | "list">("tile");
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);

  // The visible list, appended to by "Load more" — resets from the server
  // whenever the filters actually change (a real page load, which remounts
  // this component with fresh props).
  const [items, setItems] = useState<MediaRow[]>(media);
  const [loadingMore, isLoadingMoreTransition] = useTransition();
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

  const toggleHref = (nextPurpose: "marketing" | "related") =>
    `/sites/${siteId}/media?purpose=${nextPurpose}`;

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
    isLoadingMoreTransition(async () => {
      const { rows } = await listMedia(artistId, {
        purpose,
        q: q || undefined,
        tag: tag || undefined,
        artworkId: artworkId || undefined,
        sort: sort || undefined,
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
    });
  }, [artistId, purpose, q, tag, artworkId, sort, items.length, pageSize, isLoadingMoreTransition]);

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
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "1fr 480px" }}>
        <div>
          {/* Sticky, per the standing "fixed headers, independently-
              scrolling columns" layout rule (2026-08-03) — never actually
              applied here before. Only this left track needs it; the
              detail panel on the right already has its own sticky
              treatment below. No negative-margin full-bleed trick here
              (unlike the Video Editor's single-column header) since this
              sits inside a two-column grid — extending edge-to-edge would
              overlap the detail panel column. */}
          <div className="sticky top-0 z-10 -mt-4 space-y-3 border-b border-neutral-200 bg-white pb-3 pt-4">
          {/* Row 1: title + view controls — same pattern as the Artwork
              Catalogue, both govern how the whole catalogue displays. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>

            <div className="flex items-center gap-3">
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

          {/* Row 2: Marketing/Related toggle + filtering. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm">
              <Link
                href={toggleHref("marketing")}
                className={`px-4 py-1.5 ${
                  purpose === "marketing" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                }`}
              >
                Marketing
              </Link>
              <Link
                href={toggleHref("related")}
                className={`px-4 py-1.5 font-medium ${
                  purpose === "related"
                    ? "bg-neutral-900 text-white"
                    : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                }`}
              >
                Related ({counts.related})
              </Link>
            </div>

            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="purpose" value={purpose} />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search caption, alt text"
                className="w-44 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
              {purpose === "marketing" ? (
                <select
                  name="tag"
                  defaultValue={tag}
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
                  name="artworkId"
                  defaultValue={artworkId}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All artworks</option>
                  {artistArtworks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.presentationTitle}
                    </option>
                  ))}
                </select>
              )}
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">Sort: Date added</option>
                <option value="caption">Sort: Caption</option>
              </select>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Apply
              </button>
            </form>
          </div>
          </div>

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
                  onClick={() => handleSelect(m.id)}
                  disabled={selectingId === m.id}
                  className={`block w-full rounded-md border-2 p-1 text-left ${
                    selected?.id === m.id ? "border-neutral-900" : "border-transparent"
                  } ${selectingId === m.id ? "opacity-60" : ""}`}
                >
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
                      → {m.artwork.presentationTitle}
                    </p>
                  )}
                </button>
              ))}
              <AddNewTile artistId={artistId} siteId={siteId} />
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 font-medium"></th>
                  <th className="py-2 font-medium">Caption</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium">Related Artwork</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => handleSelect(m.id)}
                    className={`cursor-pointer border-b border-neutral-100 ${
                      selected?.id === m.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    } ${selectingId === m.id ? "opacity-60" : ""}`}
                  >
                    <td className="py-2">
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
                      {m.artwork ? m.artwork.presentationTitle : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-neutral-100">
                  <td colSpan={4} className="py-2">
                    <AddNewRow artistId={artistId} siteId={siteId} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {hasMore && (
            <div ref={sentinelRef} className="mt-4 flex h-8 items-center justify-center">
              {loadingMore && <span className="text-sm text-neutral-400">Loading…</span>}
            </div>
          )}
        </div>

        <div className="sticky top-4">
          {selected ? (
            <MediaDetailPanel
              key={selected.id}
              siteId={siteId}
              media={selected}
              tagPresets={tagPresets}
              artistArtworks={artistArtworks}
              onClose={handleClose}
              onArchived={handleArchived}
              onDataChanged={refreshSelected}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
              Select an item to see its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function handleFileUpload(
  file: File,
  artistId: string,
  siteId: string,
  onDone: (error: string | null) => void
) {
  try {
    await uploadFileDirect(file, artistId);
    window.location.href = `/sites/${siteId}/media`;
  } catch (err) {
    // A network error, a dropped connection, or the upload step itself
    // failing all land here — surfaced now instead of going silent.
    onDone(err instanceof Error ? err.message : "Upload failed. Try again.");
  }
}

// Replaces the old toolbar "+ Upload" button — sits as the last grid tile
// instead, same "click straight in, no form fields first" pattern as
// Artworks' "+ Add New" tile. Still needs a real file picked (unlike an
// artwork, media can't exist without one), so this opens the file dialog
// directly rather than creating anything blank first.
function AddNewTile({ artistId, siteId }: { artistId: string; siteId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <label
      className={`flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed text-center text-sm ${
        uploading
          ? "cursor-wait border-neutral-300 text-neutral-400"
          : "cursor-pointer border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      }`}
    >
      {uploading ? "Uploading…" : error ? <span className="px-2 text-red-500">{error}</span> : "+ Add New"}
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError(null);
          setUploading(true);
          handleFileUpload(file, artistId, siteId, (err) => {
            setUploading(false);
            if (err) setError(err);
          });
        }}
      />
    </label>
  );
}

// Same "+ Add New" action, as a row for List view.
function AddNewRow({ artistId, siteId }: { artistId: string; siteId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <label
      className={`text-sm ${
        uploading
          ? "cursor-wait text-neutral-400"
          : "cursor-pointer text-neutral-500 hover:text-neutral-900 hover:underline"
      }`}
    >
      {uploading ? "Uploading…" : error ? <span className="text-red-500">{error}</span> : "+ Add New"}
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError(null);
          setUploading(true);
          handleFileUpload(file, artistId, siteId, (err) => {
            setUploading(false);
            if (err) setError(err);
          });
        }}
      />
    </label>
  );
}
