"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStudioArtworks } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { inputCls, NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// The catalogue every Consign / Sold / Payment flow starts from: a grid of
// the artist's artworks (with a search box that opens above the buttons).
// Tap a tile, then Select. Only an available work can be chosen.
//
// With `tapToChoose` (Sold) it is simpler: only unsold works are listed,
// there is no Search or Select, and tapping a work chooses it straight
// away. The grid then takes the buttons' space, showing exactly four rows
// (12 works) — its height is worked out from its own width, so this holds
// on any phone.

const SEARCH_DEBOUNCE_MS = 350;

// Four rows of tiles, from the grid's width (100cqw): each column is
// (width - 50px) / 3 — 2px border, 24px padding, two 12px gaps — and each
// tile is its column plus 40px (border, padding and the two text lines);
// add the border, padding and three 12px row gaps.
const FOUR_ROWS_HEIGHT = "h-[calc((100cqw_-_50px)*4/3_+_222px)]";

function soldMessage(availability: StudioArtworkTile["availability"]): string {
  return availability === "SOLD"
    ? "That work is already sold."
    : "That work is already sold, payment still due.";
}

export default function ArtworkCatalogue({
  token,
  onChosen,
  tapToChoose = false,
}: {
  token: string;
  // Called with the artwork the artist selected.
  onChosen: (artwork: StudioArtworkTile) => void;
  // Unsold works only; tapping one chooses it (see the note above).
  tapToChoose?: boolean;
}) {
  const [artworks, setArtworks] = useState<StudioArtworkTile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<StudioArtworkTile | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Only the newest request may update the list — typing fires several in
  // quick succession and they can finish out of order.
  const requestRef = useRef(0);
  // The search the list on screen belongs to, so "load more" always
  // continues that list even while a newer search is still being typed.
  const queryRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const runQuery = useCallback(
    async (query: string, offset: number) => {
      const id = ++requestRef.current;
      if (offset === 0) queryRef.current = query;
      setLoading(true);
      setLoadError(false);
      try {
        const result = await fetchStudioArtworks(token, {
          q: query,
          offset,
          availableOnly: tapToChoose,
        });
        if (id !== requestRef.current) return;
        setArtworks((prev) => (offset === 0 ? result.artworks : [...prev, ...result.artworks]));
        setTotal(result.total);
      } catch {
        if (id === requestRef.current) setLoadError(true);
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [token, tapToChoose]
  );

  useEffect(() => {
    void runQuery("", 0);
  }, [runQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Infinite scroll: when the marker just past the last tile scrolls into
  // view, fetch the next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadError || artworks.length >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void runQuery(queryRef.current, artworks.length);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [artworks.length, total, loading, loadError, runQuery]);

  const searchFor = (value: string) => {
    setQ(value);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runQuery(value.trim(), 0), SEARCH_DEBOUNCE_MS);
  };

  // Opens or closes the search box. The keyboard only appears once the
  // artist taps into the box — opening it and raising the keyboard in the
  // same tap left the box hidden behind the keyboard on iPhone.
  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      if (q) searchFor("");
      return;
    }
    setSearchOpen(true);
  };

  const onTile = (artwork: StudioArtworkTile) => {
    if (artwork.availability !== "AVAILABLE") {
      setNotice({ text: soldMessage(artwork.availability), tone: "info" });
      return;
    }
    setNotice(null);
    if (tapToChoose) {
      onChosen(artwork);
      return;
    }
    setSelected(artwork);
  };

  const onSelect = () => {
    if (!selected) {
      setNotice({ text: "Tap an artwork first.", tone: "info" });
      return;
    }
    onChosen(selected);
  };

  const grid = (
    <section
      className={`${panelCls} overflow-y-auto p-3 ${tapToChoose ? FOUR_ROWS_HEIGHT : "aspect-square"}`}
    >
      <div className="grid grid-cols-3 gap-3">
        {artworks.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onTile(a)}
            className={`block w-full rounded-lg border-2 p-1 text-left ${
              selected?.id === a.id ? "border-[#5a5a5a]" : "border-transparent"
            }`}
          >
            <div className="relative">
              {a.thumbnailUrl ? (
                <img
                  src={a.thumbnailUrl}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-white text-xs text-[#8a8a8a]">
                  No image
                </div>
              )}
              {a.availability !== "AVAILABLE" && (
                <span className="absolute right-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-medium uppercase text-white">
                  {a.availability === "SOLD" ? "Sold" : "Not Paid"}
                </span>
              )}
            </div>
            {/* Two fixed-height lines, so every row is the same height. */}
            <div className="mt-1 h-9">
              <p className="truncate text-[13px] leading-[18px] text-[#333]">{a.title}</p>
              <p className="truncate text-xs leading-[18px] text-[#8a8a8a]">{a.typeEdition}</p>
            </div>
          </button>
        ))}
      </div>

      {loading && artworks.length === 0 && (
        <p className="py-8 text-center text-[#8a8a8a]">Loading…</p>
      )}
      {!loading && !loadError && artworks.length === 0 && (
        <p className="py-8 text-center text-[#8a8a8a]">No artworks found</p>
      )}
      {loadError && (
        <button
          type="button"
          onClick={() => void runQuery(queryRef.current, artworks.length)}
          className="block w-full py-4 text-center text-red-700"
        >
          Couldn&apos;t load. Tap to try again.
        </button>
      )}
      <div ref={sentinelRef} className="h-1" />
    </section>
  );

  if (tapToChoose) {
    return (
      <>
        {/* The grid's height is worked out from this box's width (100cqw). */}
        <div className="[container-type:inline-size]">{grid}</div>
        <NoticeLine notice={notice} />
      </>
    );
  }

  return (
    <>
      {grid}

      <NoticeLine notice={notice} />

      <div>
        {searchOpen && (
          <div className="animate-studio-slide-down pb-4">
            <input
              type="text"
              placeholder="Title / name"
              aria-label="Title / name"
              autoComplete="off"
              enterKeyHint="search"
              value={q}
              onChange={(e) => searchFor(e.target.value)}
              // Return closes the keyboard so the Select button is visible again.
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={inputCls}
            />
          </div>
        )}

        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={toggleSearch}>Search</StudioButton>
            <StudioButton onClick={onSelect}>Select</StudioButton>
          </div>
        </section>
      </div>

      {/* Spare room below while searching. The page is otherwise exactly one
          screen tall, so when the keyboard opens iPhone has nowhere to scroll
          the search box to and leaves it hidden behind the keyboard. */}
      {searchOpen && <div aria-hidden className="h-[45dvh] shrink-0" />}
    </>
  );
}
