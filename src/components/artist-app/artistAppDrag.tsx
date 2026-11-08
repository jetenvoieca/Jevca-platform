"use client";

import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

// Dragging in the Artist App (2026-11-08): with a mouse, after moving a
// little (so a click is still a click); on a touch screen, after pressing
// and holding, so a swipe still scrolls.
export function useArtistAppSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
}

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
