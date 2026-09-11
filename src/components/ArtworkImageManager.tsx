"use client";

import { useState, useEffect } from "react";
import MediaPicker from "@/components/MediaPicker";
import VideoThumb from "@/components/VideoThumb";
import { linkImagesToArtwork, unlinkImageFromArtwork, setMainImage } from "@/lib/actions/artworks";

export type ArtworkImage = {
  id: string;
  url: string;
  displayUrl: string;
  kind: string;
  posterUrl: string | null;
};

// Reworked into a big preview + fixed 4-slot mini grid (2026-09-11,
// direct request, replacing the "two per row, unlimited rows" layout
// from the day before) — Images & Videos is now capped at 4 total: the
// Main image plus up to 3 related images, matching the mockup exactly.
// The big preview (left) stays the same size a single tile was in the
// old two-per-row grid; the space to its right holds the fixed 2×2 mini
// grid instead of a second big tile. Clicking any filled mini-grid tile
// swaps it into the big preview — view-only, it doesn't change which
// image is Main. Defaults to Main on load/whenever the active image is
// removed.
//
// Because the grid is now four fixed positions rather than a free-
// flowing, reorderable list, the old pointer-based drag-to-reorder is
// gone — promoting a different image to Main is now an explicit "Set as
// Main" action shown on the big preview whenever it isn't already
// showing the Main image, rather than a drag gesture.
//
// "Images & Videos" heading removed (2026-09-11, direct request) — the
// section is visually obvious from the image grid itself; no label
// needed above it.
export default function ArtworkImageManager({
  artworkId,
  siteId,
  artistId,
  images: initialImages,
  onDataChanged,
}: {
  artworkId: string;
  siteId: string;
  artistId: string;
  images: ArtworkImage[];
  onDataChanged?: () => void;
}) {
  const [images, setImages] = useState(initialImages);
  const [activeId, setActiveId] = useState<string | null>(initialImages[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  // Stay in sync with the server. This component owns its own copy of
  // the image list so an add/remove/Set as Main can update instantly
  // without waiting on a round trip, but it must never go stale once
  // the parent's data actually changes underneath it - e.g. after any
  // other field on this artwork autosaves and the whole thing refetches.
  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  // If whatever was showing in the big preview gets removed (or this is
  // the very first load), fall back to Main.
  useEffect(() => {
    if (!activeId || !images.some((i) => i.id === activeId)) {
      setActiveId(images[0]?.id ?? null);
    }
  }, [images, activeId]);

  const activeImage = images.find((i) => i.id === activeId) ?? null;

  const handleSetMain = (id: string) => {
    setBusy(true);
    setMainImage(artworkId, siteId, id)
      .then(() => {
        setImages((prev) => {
          const idx = prev.findIndex((i) => i.id === id);
          if (idx <= 0) return prev;
          const next = prev.slice();
          const [moved] = next.splice(idx, 1);
          next.unshift(moved);
          return next;
        });
        onDataChanged?.();
      })
      .finally(() => setBusy(false));
  };

  const handleRemove = (id: string) => {
    setBusy(true);
    unlinkImageFromArtwork(artworkId, id, siteId)
      .then(() => {
        setImages((prev) => prev.filter((i) => i.id !== id));
        onDataChanged?.();
      })
      .finally(() => setBusy(false));
  };

  const handleAdd = (
    added: { id: string; url: string; kind: string; posterUrl: string | null }[]
  ) => {
    const ids = added.map((i) => i.id);
    setBusy(true);
    linkImagesToArtwork(artworkId, ids, siteId)
      .then(() => {
        setImages((prev) => [
          ...prev,
          ...added
            .filter((img) => !prev.some((p) => p.id === img.id))
            .map((img) => ({
              id: img.id,
              url: img.url,
              displayUrl: img.url,
              kind: img.kind,
              posterUrl: img.posterUrl,
            })),
        ]);
        onDataChanged?.();
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3">
        {/* Big preview — left, same size as a single tile was in the
            old two-per-row grid. Defaults to Main; clicking a mini-grid
            tile on the right swaps the preview only, it isn't itself a
            way to change Main. */}
        <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
          {activeImage &&
            (activeImage.kind === "VIDEO" ? (
              activeImage.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeImage.posterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <VideoThumb src={activeImage.url} className="h-full w-full object-cover" />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeImage.url} alt="" className="h-full w-full object-cover" />
            ))}
          {activeImage && images[0]?.id === activeImage.id && (
            <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white">
              Main
            </span>
          )}
          {activeImage && images[0]?.id !== activeImage.id && (
            <button
              type="button"
              onClick={() => handleSetMain(activeImage.id)}
              disabled={busy}
              className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white hover:bg-neutral-900 disabled:opacity-50"
            >
              Set as Main
            </button>
          )}
        </div>

        {/* Mini grid — right, a fixed 2×2 (Main's own slot plus up to 3
            related images). Capped at 4 total: once all four positions
            hold an image there's no fifth "Add" tile. */}
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {[0, 1, 2, 3].map((i) => {
            const img = images[i];
            if (!img) {
              return (
                <div key={`add-${i}`} className="aspect-square">
                  <MediaPicker
                    artistId={artistId}
                    siteId={siteId}
                    mode="single"
                    label="Add"
                    linkedArtworkId={artworkId}
                    mediaKinds={["PHOTO", "VIDEO"]}
                    previewClassName="aspect-square h-full w-full"
                    onSelect={(added) => handleAdd(added)}
                  />
                </div>
              );
            }
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveId(img.id)}
                className={`group relative aspect-square overflow-hidden rounded-md ${
                  activeId === img.id ? "ring-2 ring-neutral-900" : ""
                }`}
              >
                {img.kind === "VIDEO" ? (
                  img.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.posterUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <VideoThumb src={img.url} className="h-full w-full object-cover" />
                  )
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                )}
                {i === 0 && (
                  <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1 py-0.5 text-[9px] text-white">
                    Main
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(img.id);
                  }}
                  className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 py-0.5 text-[10px] text-white group-hover:block"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {busy && <p className="mt-1 text-xs text-neutral-400">Saving…</p>}
    </div>
  );
}
