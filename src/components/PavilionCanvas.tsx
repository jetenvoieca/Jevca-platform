"use client";

import { useRef, useState } from "react";
import type { PavilionTile } from "@/lib/blocks";

// Freeform drag-to-reposition, drag-to-resize canvas of tiles
// (2026-08-30). Generic over PavilionTile (id/name/description/imageUrl/
// x/y/width/height) rather than PavilionCard specifically, since the
// same canvas now also renders a Pavilion's Curators when "drilled into"
// — the component itself doesn't need to know which kind of tile it's
// drawing.
//
// Manual pointer-event tracking rather than the native HTML5 drag API,
// for the same reason as ArtworkImageManager's own thumbnail reordering:
// native drag suppresses the click event once a drag actually starts,
// with no clean way to have both "click opens this card" and "drag
// repositions it" on the same element using that API. pointerdown only
// marks a card as a drag *candidate*; real pointer movement is what
// promotes it to an actual drag, so a plain click never touches the drag
// path at all.
//
// Position/size are percentages of the canvas (0–100), not pixels, so
// the layout holds up across different screen widths — computed from
// the container's own bounding rect on every move, not a fixed
// px-to-percent constant.
//
// Fills whatever height its parent gives it and scrolls on its own when
// tiles are dragged below the visible area, rather than clipping them —
// same "independently scrolling column" convention already used for the
// site's own layout.
export default function PavilionCanvas({
  cards,
  onCardClick,
  onCardChange,
  highlightId,
  emptyMessage = "Add your first Pavilion using the panel on the right.",
}: {
  cards: PavilionTile[];
  onCardClick: (id: string) => void;
  // Called live during drag/resize, on every pointer move — the parent
  // owns the actual tiles array and its own debounced autosave, same as
  // everywhere else in this app; this component only ever reports the
  // numbers, never persists anything itself.
  onCardChange: (id: string, patch: Partial<Pick<PavilionTile, "x" | "y" | "width" | "height">>) => void;
  // Marks one tile with a distinct border (2026-08-30) — used to keep
  // the "anchor" Pavilion visually identifiable among its own Curators
  // when drilled into it.
  highlightId?: string;
  emptyMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const movedRef = useRef(false);
  const startRef = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0, width: 0, height: 0 });

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

  const beginDrag = (card: PavilionTile, kind: "move" | "resize") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    movedRef.current = false;
    startRef.current = { pointerX: e.clientX, pointerY: e.clientY, x: card.x, y: card.y, width: card.width, height: card.height };
    setActiveId(card.id);

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const handleMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startRef.current.pointerX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startRef.current.pointerY) / rect.height) * 100;
      if (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3) movedRef.current = true;

      if (kind === "move") {
        const nextX = clamp(startRef.current.x + dxPct, 0, 100 - startRef.current.width);
        const nextY = clamp(startRef.current.y + dyPct, 0, 100 - startRef.current.height);
        onCardChange(card.id, { x: nextX, y: nextY });
      } else {
        const nextWidth = clamp(startRef.current.width + dxPct, 8, 100 - startRef.current.x);
        const nextHeight = clamp(startRef.current.height + dyPct, 8, 100 - startRef.current.y);
        onCardChange(card.id, { width: nextWidth, height: nextHeight });
      }
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setActiveId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleCardClick = (id: string) => {
    // A real drag just happened — its release shouldn't also open the
    // card, same guard as ArtworkImageManager's thumbnail click.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onCardClick(id);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[640px] w-full select-none overflow-auto rounded-lg border border-dashed border-neutral-300 bg-neutral-50"
    >
      {cards.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
          {emptyMessage}
        </p>
      )}
      {cards.map((card) => (
        <div
          key={card.id}
          onPointerDown={beginDrag(card, "move")}
          onClick={() => handleCardClick(card.id)}
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            width: `${card.width}%`,
            height: `${card.height}%`,
            touchAction: "none",
          }}
          className={`group absolute flex cursor-move flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${
            card.id === highlightId
              ? "border-2 border-neutral-900"
              : activeId === card.id
                ? "border-neutral-900 shadow-md"
                : "border-neutral-200"
          }`}
        >
          <p className="truncate px-3 pt-2 text-center text-sm text-neutral-500">
            {card.name || "Untitled"}
          </p>
          <div className="flex-1 overflow-hidden px-3 py-1">
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt=""
                draggable={false}
                className="h-full w-full rounded-md object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                No image
              </div>
            )}
          </div>
          {card.description && (
            <p className="truncate px-3 pb-2 text-center text-xs text-neutral-400">
              {card.description}
            </p>
          )}

          {/* Resize handle — bottom-right corner, its own pointerdown so
              it never also triggers the card-move drag above. */}
          <div
            onPointerDown={beginDrag(card, "resize")}
            style={{ touchAction: "none" }}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-neutral-300 opacity-0 group-hover:opacity-100"
          />
        </div>
      ))}
    </div>
  );
}
