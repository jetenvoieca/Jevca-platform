"use client";

import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

// A list row with action buttons (2026-09-27, Inbox archive) — swiped
// left on a touchscreen, or shown on hover with a mouse.
//
// On touch: a short swipe opens the row to show the buttons; a full
// swipe (past FULL_SWIPE_RATIO of the row's width) runs the first action
// straight away. Only one row should be open at a time, so whether it's
// open is held by the parent (`open` / `onOpenChange`). Tapping an open
// row closes it rather than opening the item.
//
// Swiping is only tracked for touch and pen — a mouse never drags the
// row; it gets the same buttons on hover instead, shown only on devices
// that can actually hover, so a tap on a phone never flashes them. The
// row keeps touch-action: pan-y, so scrolling the list still works
// normally; a gesture only becomes a swipe once it's clearly sideways.

export type SwipeAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

const BUTTON_WIDTH = 80; // px, each button revealed by a swipe
const DRAG_START = 8; // px of movement before a gesture counts as a swipe
const FULL_SWIPE_RATIO = 0.6;

type Gesture = {
  startX: number;
  startY: number;
  base: number; // where the row sat when the gesture started
  x: number; // where it sits now
  swiping: boolean;
};

export default function SwipeRow({
  actions,
  open,
  onOpenChange,
  busy = false,
  children,
}: {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Set at the end of a swipe, so the click the browser may fire right
  // after it doesn't also open the item.
  const justSwiped = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);
  // A full swipe slides the row off and leaves it there until the
  // parent's list refreshes without it.
  const [committed, setCommitted] = useState(false);

  const openWidth = actions.length * BUTTON_WIDTH;
  const restX = open ? -openWidth : 0;
  const x = dragX ?? restX;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    justSwiped.current = false;
    if (e.pointerType === "mouse" || busy || committed) return;
    gesture.current = { startX: e.clientX, startY: e.clientY, base: restX, x: restX, swiping: false };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.swiping) {
      // Mostly up/down — leave it to the list's own scrolling.
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < DRAG_START) return;
      g.swiping = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const width = rowRef.current?.offsetWidth ?? 0;
    g.x = Math.min(0, Math.max(-width, g.base + dx));
    setDragX(g.x);
  };

  const handlePointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.swiping) return;
    justSwiped.current = true;
    setDragX(null);
    const width = rowRef.current?.offsetWidth ?? 0;
    if (-g.x > width * FULL_SWIPE_RATIO) {
      setCommitted(true);
      onOpenChange(false);
      actions[0].onClick();
    } else {
      onOpenChange(-g.x > openWidth / 2);
    }
  };

  const handlePointerCancel = () => {
    gesture.current = null;
    setDragX(null);
  };

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (justSwiped.current) {
      justSwiped.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    }
  };

  const runAction = (action: SwipeAction) => {
    onOpenChange(false);
    action.onClick();
  };

  return (
    <div ref={rowRef} className={`group relative overflow-hidden ${busy ? "pointer-events-none opacity-50" : ""}`}>
      {/* Revealed by a swipe — sits under the row. The first button grows
          to fill the space as the row is swiped further. */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: committed ? "100%" : Math.max(openWidth, -x) }}
      >
        {actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            tabIndex={-1}
            onClick={() => runAction(a)}
            className={`text-xs font-medium text-white ${i === 0 ? "flex-1" : "shrink-0"} ${
              a.danger ? "bg-red-600" : "bg-neutral-700"
            }`}
            style={i === 0 ? { minWidth: BUTTON_WIDTH } : { width: BUTTON_WIDTH }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div
        className={`relative touch-pan-y bg-white ${dragX === null ? "transition-transform duration-200" : ""}`}
        style={{ transform: committed ? "translateX(-100%)" : `translateX(${x}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      {/* Mouse only: the same actions on hover. */}
      <div className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 gap-1 [@media(hover:hover)]:group-hover:flex">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => runAction(a)}
            className={`rounded-md border bg-white px-2 py-1 text-xs shadow-sm ${
              a.danger
                ? "border-red-200 text-red-600 hover:bg-red-50"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
