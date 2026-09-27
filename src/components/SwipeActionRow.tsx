"use client";

import { useRef, useState, type PointerEvent, type ReactNode, type MouseEvent } from "react";

// A list row with quick actions (2026-09-27, Inbox archiving — direct
// decisions):
//   - On a touch screen, swiping the row left slides it aside to show
//     its action buttons. A short swipe leaves them showing to tap; a
//     long swipe (past FULL_SWIPE_RATIO of the row's width) runs
//     `onFullSwipe` straight away. Tapping a row whose buttons are
//     showing just closes it again rather than opening it.
//   - With a mouse, the same buttons appear over the right-hand end of
//     the row on hover instead — only on devices that can hover, so a
//     tap on a touch screen never shows them by accident.
// Only one row's buttons show at a time: the parent owns which (`open`
// / `onOpenChange`). Swipes that start more up/down than sideways are
// left alone, so the list still scrolls normally.

export type SwipeAction = {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

const ACTION_WIDTH = 80; // px, per revealed button
const INTENT_PX = 8; // movement before a swipe counts as sideways or not
const FULL_SWIPE_RATIO = 0.6;
const SLIDE_MS = 200;

export default function SwipeActionRow({
  actions,
  open,
  onOpenChange,
  onFullSwipe,
  disabled = false,
  children,
}: {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFullSwipe?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    x: number;
    sideways: boolean | null;
  } | null>(null);
  // Set once a swipe ends, so the click some browsers still fire at the
  // end of it doesn't also open the row. Cleared at the next touch.
  const swallowClick = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  const actionsWidth = ACTION_WIDTH * actions.length;
  const restX = open ? -actionsWidth : 0;
  const rowWidth = () => rowRef.current?.offsetWidth ?? 0;
  const x = leaving ? -rowWidth() : dragX ?? restX;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    if (e.pointerType !== "touch" || disabled || leaving) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: restX,
      x: restX,
      sideways: null,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.sideways === null) {
      if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return;
      d.sideways = Math.abs(dx) > Math.abs(dy);
      if (!d.sideways) {
        drag.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.x = Math.min(0, Math.max(-rowWidth(), d.baseX + dx));
    setDragX(d.x);
  };

  const handlePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragX(null);
    if (!d.sideways) return;
    swallowClick.current = true;
    const distance = -d.x;
    if (onFullSwipe && distance > rowWidth() * FULL_SWIPE_RATIO) {
      setLeaving(true);
      window.setTimeout(onFullSwipe, SLIDE_MS);
      return;
    }
    onOpenChange(distance > actionsWidth / 2);
  };

  const handlePointerCancel = () => {
    drag.current = null;
    setDragX(null);
  };

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (swallowClick.current || open) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick.current = false;
      if (open) onOpenChange(false);
    }
  };

  const runAction = (action: SwipeAction) => {
    onOpenChange(false);
    action.onClick();
  };

  const swipeBtnCls = (tone: SwipeAction["tone"]) =>
    `h-full text-xs font-medium text-white disabled:opacity-50 ${
      tone === "danger" ? "bg-red-600" : "bg-neutral-700"
    }`;
  const hoverBtnCls = (tone: SwipeAction["tone"]) =>
    `rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 disabled:opacity-50 ${
      tone === "danger" ? "hover:text-red-600" : "hover:text-neutral-900"
    }`;

  return (
    <div ref={rowRef} className="group relative overflow-hidden">
      {/* Revealed by a swipe, behind the row. */}
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => runAction(a)}
            disabled={disabled}
            style={{ width: ACTION_WIDTH }}
            className={swipeBtnCls(a.tone)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* The row itself — slides left over the buttons above. */}
      <div
        className="relative bg-white"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragX === null ? `transform ${SLIDE_MS}ms ease-out` : "none",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      {/* Shown on mouse hover instead (hover-capable devices only). */}
      {!open && !leaving && (
        <div className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 gap-1 rounded-md bg-neutral-50 pl-2 [@media(hover:hover)]:group-hover:flex">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => a.onClick()}
              disabled={disabled}
              className={hoverBtnCls(a.tone)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
