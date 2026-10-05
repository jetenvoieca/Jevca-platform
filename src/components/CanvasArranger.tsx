"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { listCurationCovers, type CurationCover } from "@/lib/actions/curations";
import { getPageCanvas, savePageCanvas, type CanvasPlacement } from "@/lib/actions/pageCanvas";

// The Arrange canvas editor (2026-10-05) — full screen, opened from the
// Pages page for a page whose Display Style is a Canvas. On the left,
// the artist's curations not yet on the canvas: click one to place it in
// the middle of the current view. On the right, the canvas: each
// curation as its cover (first work's main image, name over it) at the
// style's tile size, dragged into place; ✕ takes it off. The canvas
// grows as tiles are dragged towards its right and bottom edges. Every
// change saves itself, one save at a time, in order.
export default function CanvasArranger({
  siteId,
  pageId,
  pageTitle,
  artistId,
  tileSize,
  backgroundColor,
  onClose,
}: {
  siteId: string;
  pageId: string;
  pageTitle: string;
  artistId: string;
  tileSize: number;
  backgroundColor: string | null;
  onClose: () => void;
}) {
  const [covers, setCovers] = useState<CurationCover[] | null>(null);
  const [placements, setPlacements] = useState<CanvasPlacement[]>([]);
  const [status, setStatus] = useState({ text: "", isError: false });
  const scrollRef = useRef<HTMLDivElement>(null);
  const placementsRef = useRef<CanvasPlacement[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // The tile being dragged: where the pointer started, where the tile
  // started, and where it is now.
  const dragRef = useRef<{
    curationId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    x: number;
    y: number;
  } | null>(null);

  placementsRef.current = placements;

  useEffect(() => {
    let current = true;
    Promise.all([listCurationCovers(artistId), getPageCanvas(siteId, pageId)]).then(
      ([loadedCovers, loadedPlacements]) => {
        if (!current) return;
        setCovers(loadedCovers);
        setPlacements(loadedPlacements);
      }
    );
    return () => {
      current = false;
    };
  }, [artistId, siteId, pageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (next: CanvasPlacement[]) => {
    setStatus({ text: "Saving…", isError: false });
    queueRef.current = queueRef.current.then(async () => {
      try {
        const result = await savePageCanvas(siteId, pageId, next);
        setStatus(
          "error" in result ? { text: result.error, isError: true } : { text: "Saved", isError: false }
        );
      } catch {
        setStatus({ text: "Couldn't save — try again.", isError: true });
      }
    });
  };

  const commit = (next: CanvasPlacement[]) => {
    setPlacements(next);
    save(next);
  };

  // A new tile goes in the middle of what's currently in view.
  const add = (curationId: string) => {
    const el = scrollRef.current;
    const x = Math.max(0, Math.round((el?.scrollLeft ?? 0) + (el?.clientWidth ?? 0) / 2 - tileSize / 2));
    const y = Math.max(0, Math.round((el?.scrollTop ?? 0) + (el?.clientHeight ?? 0) / 2 - tileSize / 2));
    commit([...placements, { curationId, x, y }]);
  };

  const remove = (curationId: string) =>
    commit(placements.filter((p) => p.curationId !== curationId));

  const startDrag = (e: PointerEvent<HTMLDivElement>, p: CanvasPlacement) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      curationId: p.curationId,
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
      x: p.x,
      y: p.y,
    };
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    d.x = Math.max(0, Math.round(d.originX + e.clientX - d.startX));
    d.y = Math.max(0, Math.round(d.originY + e.clientY - d.startY));
    setPlacements((prev) =>
      prev.map((p) => (p.curationId === d.curationId ? { ...p, x: d.x, y: d.y } : p))
    );
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || (d.x === d.originX && d.y === d.originY)) return;
    save(
      placementsRef.current.map((p) =>
        p.curationId === d.curationId ? { ...p, x: d.x, y: d.y } : p
      )
    );
  };

  const coverById = new Map((covers ?? []).map((c) => [c.id, c]));
  const placedIds = new Set(placements.map((p) => p.curationId));
  const available = (covers ?? []).filter((c) => !placedIds.has(c.id));

  // Room to keep dragging beyond the furthest tile.
  const width = Math.max(0, ...placements.map((p) => p.x)) + tileSize * 3;
  const height = Math.max(0, ...placements.map((p) => p.y)) + tileSize * 3;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
          Arrange canvas — {pageTitle}
        </h2>
        <span className={`text-xs ${status.isError ? "text-red-600" : "text-neutral-500"}`}>
          {status.text}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Close
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200">
          <h3 className="shrink-0 px-4 pb-2 pt-4 text-sm font-medium text-neutral-800">
            Curations
          </h3>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {covers === null ? (
              <p className="px-1 text-xs text-neutral-400">Loading…</p>
            ) : available.length === 0 ? (
              <p className="px-1 text-xs text-neutral-400">
                {covers.length === 0
                  ? "No curations yet — make some on the Curations page."
                  : "Every curation is on the canvas."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {available.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => add(c.id)}
                    title="Add to the canvas"
                    className="flex items-center gap-2 rounded-md p-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                  >
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded bg-neutral-100" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-neutral-400">+</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-auto"
          style={{ backgroundColor: backgroundColor ?? undefined }}
        >
          <div
            className="relative"
            style={{ width, height, minWidth: "100%", minHeight: "100%" }}
          >
            {placements.length === 0 && covers !== null && (
              <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-neutral-400">
                Add curations from the list on the left, then drag them into place.
              </p>
            )}
            {placements.map((p) => {
              const cover = coverById.get(p.curationId);
              return (
                <div
                  key={p.curationId}
                  onPointerDown={(e) => startDrag(e, p)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="group absolute cursor-grab touch-none select-none overflow-hidden rounded-md bg-neutral-200 shadow active:cursor-grabbing"
                  style={{ left: p.x, top: p.y, width: tileSize, height: tileSize }}
                >
                  {cover?.imageUrl && (
                    <img
                      src={cover.imageUrl}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-sm text-white">
                    {cover?.name ?? "…"}
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => remove(p.curationId)}
                    title="Take off the canvas"
                    className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
