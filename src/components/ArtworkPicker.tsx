"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  getArtworksForArtist,
  quickCreateArtwork,
  type PickerArtwork as PickedArtwork,
} from "@/lib/actions/media";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { useClientWords } from "@/components/ClientWordsProvider";

export default function ArtworkPicker({
  artistId,
  mode = "single",
  label,
  variant = "tile",
  allowCreate = true,
  excludeIds = [],
  availableOnly = false,
  small = false,
  onSelect,
}: {
  artistId: string;
  mode?: "single" | "multi";
  // Defaults to "Add Artwork" / "Add Product".
  label?: string;
  // "tile": the universal dashed-tile trigger used everywhere media/
  // artworks get ADDED to a grid (default, unchanged).
  // "button": a plain standard button — for places like the Hopper where
  // the action is assigning/routing an existing item, not adding new
  // media, so the "+ Add" tile's implication (this creates something new)
  // would be misleading. See decisions-log, 2026-08-05.
  variant?: "tile" | "button";
  // Whether the "type a new artwork name… Create" box is offered
  // (2026-09-24). Off for Curations, which only ever gather works that
  // already exist in the catalogue.
  allowCreate?: boolean;
  // Artworks to leave out of the list (2026-09-24) — e.g. works already
  // in the curation being added to, so they can't be picked twice.
  excludeIds?: string[];
  // Only works still for sale (2026-10-20) — e.g. Locations' Add works.
  availableOnly?: boolean;
  // The "button" trigger at the small size of the buttons beside it
  // (2026-10-20 — Locations' Add works).
  small?: boolean;
  onSelect: (artworks: PickedArtwork[]) => void;
}) {
  const words = useClientWords();
  const triggerLabel = label ?? `Add ${words.item}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Location and Type filters (2026-10-04) — the same lists the Artwork
  // Catalogue's own filters offer, loaded the first time the picker
  // opens.
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [filterOptions, setFilterOptions] = useState<{
    locations: string[];
    types: string[];
  } | null>(null);
  // The list loads a page at a time as you scroll (2026-10-13), like the
  // Artwork Catalogue — it used to stop at the 60 newest.
  const [artworks, setArtworks] = useState<PickedArtwork[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<PickedArtwork[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Each new search counts up, so an older search's answer arriving late
  // (or a page loading for it) can't replace the newer results.
  const requestRef = useRef(0);
  const filtersRef = useRef({ q: "", location: "", type: "" });

  const fetchPage = (offset: number) => {
    const f = filtersRef.current;
    return getArtworksForArtist(artistId, {
      q: f.q || undefined,
      location: f.location || undefined,
      type: f.type || undefined,
      excludeIds,
      availableOnly,
      offset,
    });
  };

  const load = (q: string, loc = location, t = type) => {
    filtersRef.current = { q, location: loc, type: t };
    const request = ++requestRef.current;
    startTransition(async () => {
      const page = await fetchPage(0);
      if (request !== requestRef.current) return;
      setArtworks(page.rows);
      setTotal(page.total);
      scrollRef.current?.scrollTo({ top: 0 });
    });
  };

  const hasMore = artworks.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || isPending) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(artworks.length);
      if (request !== requestRef.current) return;
      setArtworks((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.rows.filter((a) => !seen.has(a.id))];
      });
      setTotal(page.total);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks.length, loadingMore, isPending]);

  // The next page loads as the bottom of the list scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!open || !node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRef.current, rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasMore, loadMore]);

  const handleOpen = () => {
    setOpen(true);
    setSelected([]);
    load(query);
    if (!filterOptions) {
      getArtworkSettings(artistId).then((s) =>
        setFilterOptions({ locations: s.locations.map((l) => l.name), types: s.artworkTypes })
      );
    }
  };

  // Debounced search-as-you-type (2026-08-31) — previously fired a full
  // server request on every keystroke, same issue already fixed in
  // CustomerPicker.tsx (see that file for the original pattern this
  // copies). Only fires while the picker is open, and only reacts to
  // `query` changing — handleOpen's own immediate load() above still
  // runs right away when the picker is first opened.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handlePick = (a: PickedArtwork) => {
    if (mode === "single") {
      onSelect([a]);
      setOpen(false);
    } else {
      setSelected((prev) =>
        prev.some((p) => p.id === a.id) ? prev.filter((p) => p.id !== a.id) : [...prev, a]
      );
    }
  };

  const confirmMulti = () => {
    onSelect(selected);
    setSelected([]);
    setOpen(false);
  };

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateArtwork(artistId, newTitle);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.artwork) {
        const a: PickedArtwork = {
          id: result.artwork.id,
          catalogueName: result.artwork.catalogueName,
          type: null,
          imageUrl: null,
          presentationPrice: null,
          availability: "AVAILABLE",
        };
        setArtworks((prev) => [a, ...prev]);
        setTotal((n) => n + 1);
        setNewTitle("");
        handlePick(a);
      }
    });
  };

  // Same trigger as MediaPicker by default — a blank dashed tile, not a
  // button. See decisions-log.md, 2026-07-31. The "button" variant opts
  // out of that for contexts where a dashed "+ Add" tile would mislead
  // (see prop comment above).
  // The modal opens over the whole screen through a portal (2026-10-08),
  // so it works wherever the picker sits — even inside a moved or scaled
  // box, like a campaign mail's components. The trigger stays in place.
  let trigger: ReactNode;
  if (variant === "button") {
    trigger = (
      <button
        type="button"
        onClick={handleOpen}
        className={`rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 ${
          small ? "px-3 py-[4px] text-xs" : "px-4 py-2 text-sm"
        }`}
      >
        {triggerLabel}
      </button>
    );
  } else {
    trigger = (
      <button
        type="button"
        onClick={handleOpen}
        className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + {triggerLabel}
      </button>
    );
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, catalogue #, medium"
            autoFocus
            className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              load(query, e.target.value, type);
            }}
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="">All locations</option>
            {filterOptions?.locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              load(query, location, e.target.value);
            }}
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="">All types</option>
            {filterOptions?.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          {allowCreate && (
            <>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`Or type a new ${words.item.toLowerCase()} name…`}
                className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim() || isPending}
                className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
              >
                Create
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {error && (
          <p className="border-b border-neutral-200 bg-red-50 px-4 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {/* Visible loading state (2026-08-31) — previously there was no
              indication a search was in flight at all, which is exactly
              what makes a picker feel unresponsive/broken rather than
              just "a bit slow". */}
          {isPending && (
            <p className="pb-3 text-xs text-neutral-400">Searching…</p>
          )}
          <div className="grid grid-cols-8 gap-3">
            {artworks.map((a) => {
              const isSelected = selected.some((s) => s.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handlePick(a)}
                  className={`overflow-hidden rounded-md border-2 text-left ${
                    isSelected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                  }`}
                >
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400">
                      No image
                    </div>
                  )}
                  <div className="px-1 py-1">
                    <p className="truncate text-xs text-neutral-700">{a.catalogueName}</p>
                    <p className="truncate text-xs text-neutral-500">{a.type || "—"}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="flex h-8 items-center justify-center">
              {loadingMore && <span className="text-xs text-neutral-400">Loading…</span>}
            </div>
          )}
          {artworks.length === 0 && !isPending && (
            <p className="py-12 text-center text-sm text-neutral-400">
              {query || location || type
                ? `No ${words.items.toLowerCase()} match these filters.`
                : allowCreate
                  ? `No ${words.items.toLowerCase()} yet — type a name above to create one.`
                  : `No ${words.items.toLowerCase()} to add.`}
            </p>
          )}
        </div>

        {mode === "multi" && (
          <div className="flex items-center justify-between border-t border-neutral-200 p-4">
            <span className="text-sm text-neutral-500">{selected.length} selected</span>
            <button
              type="button"
              onClick={confirmMulti}
              disabled={selected.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {open && createPortal(modal, document.body)}
    </>
  );
}
