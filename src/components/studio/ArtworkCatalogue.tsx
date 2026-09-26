"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStudioArtworks } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { panelCls } from "@/components/studio/StudioUi";

// The catalogue every Consign / Sold / Payment flow starts from: a grid of
// the artist's unsold works. Tapping a work chooses it. The grid shows
// exactly four rows (12 works) and scrolls for more, loading further pages
// as it goes — its height is worked out from its own width, so this holds
// on any phone.

// Four rows of tiles, from the grid's width (100cqw): each column is
// (width - 50px) / 3 — 2px border, 24px padding, two 12px gaps — and each
// tile is its column plus 40px (border, padding and the two text lines);
// add the border, padding and three 12px row gaps.
const FOUR_ROWS_HEIGHT = "h-[calc((100cqw_-_50px)*4/3_+_222px)]";

export default function ArtworkCatalogue({
  token,
  onChosen,
}: {
  token: string;
  // Called with the artwork the artist tapped.
  onChosen: (artwork: StudioArtworkTile) => void;
}) {
  const [artworks, setArtworks] = useState<StudioArtworkTile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadFrom = useCallback(
    async (offset: number) => {
      setLoading(true);
      setLoadError(false);
      try {
        const result = await fetchStudioArtworks(token, offset);
        setArtworks((prev) => (offset === 0 ? result.artworks : [...prev, ...result.artworks]));
        setTotal(result.total);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadFrom(0);
  }, [loadFrom]);

  // Infinite scroll: when the marker just past the last tile scrolls into
  // view, fetch the next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadError || artworks.length >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadFrom(artworks.length);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [artworks.length, total, loading, loadError, loadFrom]);

  return (
    // The grid's height is worked out from this box's width (100cqw).
    <div className="[container-type:inline-size]">
      <section className={`${panelCls} overflow-y-auto p-3 ${FOUR_ROWS_HEIGHT}`}>
        <div className="grid grid-cols-3 gap-3">
          {artworks.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChosen(a)}
              className="block w-full rounded-lg border-2 border-transparent p-1 text-left"
            >
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
          <p className="py-8 text-center text-[#8a8a8a]">No unsold artworks</p>
        )}
        {loadError && (
          <button
            type="button"
            onClick={() => void loadFrom(artworks.length)}
            className="block w-full py-4 text-center text-red-700"
          >
            Couldn&apos;t load. Tap to try again.
          </button>
        )}
        <div ref={sentinelRef} className="h-1" />
      </section>
    </div>
  );
}
