"use client";

import { useState, useEffect, useRef } from "react";
import MediaPicker from "@/components/MediaPicker";
import { linkImagesToArtwork, unlinkImageFromArtwork, setMainImage } from "@/lib/actions/artworks";

export type ArtworkImage = {
  id: string;
  url: string;
  displayUrl: string;
  kind: string;
  posterUrl: string | null;
};

// Rebuilt from scratch (2026-08-16) after the native HTML5 draggable
// version proved unreliable in practice. Root cause: the native drag
// API suppresses the click event by spec once a drag actually starts -
// there's no clean way to have both "click selects" and "drag
// reorders" on the same element using that API, which is exactly why
// click-to-preview kept intermittently breaking around drag support,
// however it was patched.
//
// This tracks dragging manually with plain pointer events instead:
// pointerdown notes which thumbnail might be starting a drag, and only
// pointermove (real movement) marks it as an actual drag in progress.
// A plain click - pointerdown then pointerup with no movement in
// between - never touches that path at all, so the browser's normal
// click event fires completely normally and independently. Hit-testing
// during a drag uses document.elementFromPoint rather than per-element
// hover events, since pointer capture isn't used here (window-level
// listeners handle move/up regardless of which element is under the
// pointer, which is simpler and more robust than trying to coordinate
// capture across many sibling thumbnails).
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dragIdRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const movedRef = useRef(false);

  // Stay in sync with the server. This component owns its own copy of
  // the image list so a reorder can update instantly without waiting on
  // a round trip, but it must never go stale once the parent's data
  // actually changes underneath it - e.g. after any other field on this
  // artwork autosaves and the whole thing refetches, which used to
  // leave the old version of this component's state frozen and
  // silently out of sync with what was actually saved.
  useEffect(() => {
    setImages(initialImages);
    setSelectedIndex(0);
  }, [initialImages]);

  // Only position 0 ("main") is ever persisted - the rest of the drag
  // order is just this editing session's own convenience, not saved.
  const persistIfMainChanged = (nextImages: ArtworkImage[], prevFirstId: string | null) => {
    const newFirstId = nextImages[0]?.id ?? null;
    if (newFirstId && newFirstId !== prevFirstId) {
      setBusy(true);
      setMainImage(artworkId, siteId, newFirstId)
        .then(() => onDataChanged?.())
        .finally(() => setBusy(false));
    }
  };

  useEffect(() => {
    if (!dragId) return;

    const handleMove = (e: PointerEvent) => {
      movedRef.current = true;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const thumb = el?.closest<HTMLElement>("[data-thumb-id]");
      const id = thumb?.dataset.thumbId ?? null;
      if (id !== overIdRef.current) {
        overIdRef.current = id;
        setOverId(id);
      }
    };

    const handleUp = () => {
      const from = dragIdRef.current;
      const to = overIdRef.current;
      if (from && to && from !== to) {
        setImages((prev) => {
          const fromIdx = prev.findIndex((i) => i.id === from);
          const toIdx = prev.findIndex((i) => i.id === to);
          if (fromIdx === -1 || toIdx === -1) return prev;
          const prevFirstId = prev[0]?.id ?? null;
          const next = prev.slice();
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          persistIfMainChanged(next, prevFirstId);
          return next;
        });
      }
      dragIdRef.current = null;
      overIdRef.current = null;
      setDragId(null);
      setOverId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return; // primary button/touch only
    movedRef.current = false;
    dragIdRef.current = id;
    setDragId(id);
  };

  const handleThumbnailClick = (index: number) => {
    // A real drag just happened - don't also treat its release as a
    // click. Belt-and-braces alongside the fact that a plain click
    // never sets movedRef true in the first place.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    setSelectedIndex(index);
  };

  const handleRemove = (id: string) => {
    setBusy(true);
    unlinkImageFromArtwork(artworkId, id, siteId)
      .then(() => {
        setImages((prev) => prev.filter((i) => i.id !== id));
        setSelectedIndex(0);
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

  const active = images[Math.min(selectedIndex, images.length - 1)] ?? null;

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-medium text-neutral-700">Images &amp; Videos</h3>

      {active && (
        <div className="mb-3 flex h-96 items-center justify-center rounded-lg bg-neutral-50">
          {active.kind === "VIDEO" ? (
            <video
              key={active.id}
              src={active.displayUrl}
              controls
              className="max-h-96 max-w-full rounded-lg"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={active.id}
              src={active.displayUrl}
              alt=""
              className="max-h-96 max-w-full rounded-lg object-contain"
            />
          )}
        </div>
      )}

      <p className="mb-2 text-xs text-neutral-400">
        The first one is the main image shown in the catalogue - drag any thumbnail to the front
        to make it the main one instead. Click a thumbnail to preview it above.
      </p>

      <div className="flex flex-wrap gap-2">
        {images.map((img, index) => (
          <div
            key={img.id}
            data-thumb-id={img.id}
            onPointerDown={handlePointerDown(img.id)}
            onClick={() => handleThumbnailClick(index)}
            style={{ touchAction: "none" }}
            className={`group relative h-20 w-20 cursor-pointer select-none rounded ${
              dragId === img.id ? "opacity-40" : ""
            } ${
              overId === img.id && dragId && dragId !== img.id
                ? "ring-2 ring-offset-2 ring-blue-400"
                : ""
            }`}
          >
            {img.kind === "VIDEO" ? (
              img.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.posterUrl}
                  alt=""
                  draggable={false}
                  className={`h-20 w-20 rounded object-cover ${
                    index === selectedIndex ? "ring-2 ring-neutral-900" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded bg-neutral-200 text-[10px] text-neutral-500 ${
                    index === selectedIndex ? "ring-2 ring-neutral-900" : ""
                  }`}
                >
                  Video
                </div>
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.url}
                alt=""
                draggable={false}
                className={`h-20 w-20 rounded object-cover ${
                  index === selectedIndex ? "ring-2 ring-neutral-900" : ""
                }`}
              />
            )}
            {index === 0 && (
              <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1 text-[9px] text-white">
                Main
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(img.id);
              }}
              className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 text-xs text-white group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="h-20 w-20">
          <MediaPicker
            artistId={artistId}
            mode="multi"
            label="Add"
            linkedArtworkId={artworkId}
            mediaKinds={["PHOTO", "VIDEO"]}
            onSelect={handleAdd}
          />
        </div>
      </div>
      {busy && <p className="mt-1 text-xs text-neutral-400">Saving…</p>}
    </div>
  );
}
