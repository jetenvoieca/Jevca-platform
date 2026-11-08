"use client";

import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

// Dragging in the Artist App (2026-11-08): with a mouse, after moving a
// little (so a click is still a click); on a touch screen, after pressing
// and holding, so a swipe still scrolls and a tap is still a tap.
export function useArtistAppSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
}

// After a drag ends, the tap it ends with is ignored (2026-11-08): the
// iPad sends a click when the finger lifts, which otherwise opened the
// dropped item's window. Called from a DndContext's onDragEnd and
// onDragCancel; a click that never comes stops being waited for.
export function ignoreClickAfterDrag() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
}

// What a draggable item needs on a touch screen: no picture menu or text
// selection while pressing and holding to drag.
export const TOUCH_DRAG_CLASS = "select-none [-webkit-touch-callout:none] [touch-action:manipulation]";

// A picture following the finger or pointer while dragging.
export function DragThumb({ url }: { url: string | null }) {
  return (
    <div className="h-24 w-24 overflow-hidden rounded-sm shadow-md">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-neutral-200" />
      )}
    </div>
  );
}
