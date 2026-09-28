"use client";

import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

// A list row with action buttons (2026-09-27, Inbox archive) — swiped
// left on a touchscreen, or shown on hover with a mouse.
//
// On touch: a short swipe opens the row to show the buttons (with their
// words); a full swipe (past FULL_SWIPE_RATIO of the row's width) runs the
// primary action — the one marked `primary`, or else the first — straight
// away. If that action doesn't go ahead (it returns false — e.g.
// a Delete whose confirm was cancelled), the row slides back. Only one
// row should be open at a time, so whether it's open is held by the
// parent (`open` / `onOpenChange`). Tapping an open row closes it rather
// than opening the item.
//
// Swiping is only tracked for touch and pen — a mouse never drags the
// row; it gets the same actions on hover instead, as a small icon panel
// in the row's bottom-right corner, under its date (2026-09-28, direct
// request — the worded buttons overlapped the row), each icon naming
// itself on hover. Shown only on devices that can actually hover, so a
// tap on a phone never flashes it. The row keeps touch-action: pan-y, so
// scrolling the list still works normally; a gesture only becomes a
// swipe once it's clearly sideways.

export type SwipeAction = {
  label: string;
  // Shown in the hover panel; the label becomes its tooltip.
  icon: ReactNode;
  // The action a full swipe runs; defaults to the first.
  primary?: boolean;
  // Return false if the action didn't go ahead, so a full swipe puts the
  // row back.
  onClick: () => void | boolean;
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
  const primary = actions.find((a) => a.primary) ?? actions[0];
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
      if (primary.onClick() === false) setCommitted(false);
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
      {/* Revealed by a swipe — sits under the row. The primary button grows
          to fill the space as the row is swiped further. */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: committed ? "100%" : Math.max(openWidth, -x) }}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={-1}
            onClick={() => runAction(a)}
            className={`text-xs font-medium text-white ${a === primary ? "flex-1" : "shrink-0"} ${
              a.danger ? "bg-red-600" : "bg-neutral-700"
            }`}
            style={a === primary ? { minWidth: BUTTON_WIDTH } : { width: BUTTON_WIDTH }}
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

      {/* Mouse only: the same actions on hover, as icons. */}
      <div className="absolute bottom-1.5 right-2 z-10 hidden items-center gap-0.5 rounded-md border border-[#5E5E5E] bg-[#F9F6EF] p-0.5 [@media(hover:hover)]:group-hover:flex">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            onClick={() => runAction(a)}
            className={`rounded p-1 ${
              a.danger ? "text-neutral-800 hover:bg-red-50 hover:text-red-600" : "text-neutral-800 hover:bg-neutral-200"
            }`}
          >
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
