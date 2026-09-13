"use client";

import { useState, useEffect } from "react";
import MediaPicker from "@/components/MediaPicker";
import VideoThumb from "@/components/VideoThumb";
import SetMainFromHopperModal from "@/components/SetMainFromHopperModal";
import { linkImagesToArtwork, unlinkImageFromArtwork, deleteArtworkMainImage } from "@/lib/actions/artworks";

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
// image is Main.
//
// "Set as Main" removed entirely (2026-09-13, direct request) — Main is
// the artwork's image of record, not something to be reassigned to an
// already-linked image from in here. The only ways Main ever changes
// now: the artwork's very first image becomes Main automatically (see
// the auto-assign note on linkImagesToArtwork in actions/artworks.ts),
// or a wrong one is fixed via "Delete & Replace" below — which deletes
// it outright, then opens SetMainFromHopperModal, a limited window onto
// the Hopper (just the newest incoming image, and one action: make it
// this artwork's new Main) rather than a full page navigation.
//
// Because the grid is now four fixed positions rather than a free-
// flowing, reorderable list, the old pointer-based drag-to-reorder is
// gone.
export default function ArtworkImageManager({
  artworkId,
  siteId,
  artistId,
  images: initialImages,
  mainImageId,
  onDataChanged,
}: {
  artworkId: string;
  siteId: string;
  artistId: string;
  images: ArtworkImage[];
  // Which image (if any) is actually Main — an explicit id, not a
  // positional guess (2026-09-13 fix — see the matching note on
  // getArtworkDetailForClient in actions/artworks.ts).
  mainImageId: string | null;
  onDataChanged?: () => void;
}) {
  const [images, setImages] = useState(initialImages);
  const [localMainId, setLocalMainId] = useState(mainImageId);
  const [activeId, setActiveId] = useState<string | null>(mainImageId ?? initialImages[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  // Opened by "Delete & Replace" once the old Main image is gone — see
  // handleDeleteAndReplace below.
  const [showSetMainModal, setShowSetMainModal] = useState(false);

  // Stay in sync with the server. This component owns its own copy of
  // the image list (and of which one is Main) so an add/remove can
  // update instantly without waiting on a round trip, but it must never
  // go stale once the parent's data actually changes underneath it —
  // e.g. after any other field on this artwork autosaves and the whole
  // thing refetches.
  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  useEffect(() => {
    setLocalMainId(mainImageId);
  }, [mainImageId]);

  // If whatever was showing in the big preview gets removed (or this is
  // the very first load), fall back to Main, or the first related image
  // if there isn't one yet.
  useEffect(() => {
    if (!activeId || !images.some((i) => i.id === activeId)) {
      setActiveId(localMainId ?? images[0]?.id ?? null);
    }
  }, [images, activeId, localMainId]);

  const mainImage = localMainId ? images.find((i) => i.id === localMainId) ?? null : null;
  const relatedImages = images.filter((i) => i.id !== localMainId);
  const activeImage = images.find((i) => i.id === activeId) ?? null;

  const handleRemove = (id: string) => {
    setBusy(true);
    unlinkImageFromArtwork(artworkId, id, siteId)
      .then(() => {
        setImages((prev) => prev.filter((i) => i.id !== id));
        onDataChanged?.();
      })
      .finally(() => setBusy(false));
  };

  // Adds one or more already-uploaded images — used by every "+ Add"
  // tile below, including the Main slot's when it's empty (a brand-new
  // artwork's very first image). Whichever image ends up Main is decided
  // server-side (linkImagesToArtwork auto-assigns Main whenever the
  // artwork doesn't have one yet); the localMainId update here just
  // mirrors that same rule locally so the UI doesn't have to wait on a
  // refetch to show it correctly.
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
        setLocalMainId((prev) => prev ?? ids[0] ?? prev);
        onDataChanged?.();
      })
      .finally(() => setBusy(false));
  };

  // "Delete & Replace" (2026-09-13, direct request) — the only way left
  // to fix a wrong Main image. Deletes it outright (not just unlinks —
  // see deleteArtworkMainImage in actions/artworks.ts), then opens
  // SetMainFromHopperModal so its replacement can be picked from the
  // Hopper without leaving this panel.
  const handleDeleteAndReplace = () => {
    if (!mainImage) return;
    if (
      !confirm(
        "Delete this image? You'll be shown the Hopper's next incoming image to set as its replacement."
      )
    )
      return;
    setBusy(true);
    deleteArtworkMainImage(artworkId, mainImage.id, siteId)
      .then((result) => {
        if (!result.ok) {
          alert(result.error);
          return;
        }
        onDataChanged?.();
        setShowSetMainModal(true);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3">
        {/* Big preview — left, same size as a single tile was in the
            old two-per-row grid. Defaults to Main; clicking a mini-grid
            tile on the right swaps the preview only. */}
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
          {activeImage && activeImage.id === localMainId && (
            <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white">
              Main
            </span>
          )}
        </div>

        {/* Mini grid — right, a fixed 2×2 (Main's own slot plus up to 3
            related images). Capped at 4 total: once all four positions
            hold an image there's no fifth "Add" tile. Slot 0 is always
            Main — either its thumbnail (with Delete & Replace, not a
            plain remove), or the "+ Add" tile if there isn't one yet. */}
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {mainImage ? (
            <button
              type="button"
              onClick={() => setActiveId(mainImage.id)}
              className={`group relative aspect-square overflow-hidden rounded-md ${
                activeId === mainImage.id ? "ring-2 ring-neutral-900" : ""
              }`}
            >
              {mainImage.kind === "VIDEO" ? (
                mainImage.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mainImage.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <VideoThumb src={mainImage.url} className="h-full w-full object-cover" />
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1 py-0.5 text-[9px] text-white">
                Main
              </span>
              {/* Delete & Replace, not a plain ✕ — this is the artwork's
                  image of record, so removing it always means replacing
                  it with something else, never just unlinking it into
                  the Marketing pool the way a Related image can be. */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteAndReplace();
                }}
                className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 py-0.5 text-[9px] leading-tight text-white group-hover:block"
              >
                Delete &amp; Replace
              </span>
            </button>
          ) : (
            <div className="aspect-square">
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
          )}

          {[0, 1, 2].map((i) => {
            const img = relatedImages[i];
            if (!img) {
              return (
                <div key={`add-related-${i}`} className="aspect-square">
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

      {showSetMainModal && (
        <SetMainFromHopperModal
          artworkId={artworkId}
          siteId={siteId}
          artistId={artistId}
          onClose={() => setShowSetMainModal(false)}
          onDone={() => onDataChanged?.()}
        />
      )}
    </div>
  );
}
