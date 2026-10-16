"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Dragging by touch (2026-10-16 — the iPad). The app's drag-and-drop uses
// the browser's own drag events, which touch screens don't send; the
// drag-drop-touch library turns touches into those events, so every
// draggable list and canvas works by touch without changes of its own.
// Press and hold an item briefly, then drag — a quick swipe still
// scrolls, and a tap is still a tap. Only in the admin tool, not on the
// public websites (whose links and pictures would otherwise start drags).

const ADMIN_PATHS = ["/sites", "/accounts", "/templates", "/clients", "/preview"];
const HOLD_MS = 300;

let enabled = false;

export default function TouchDragSupport() {
  const pathname = usePathname();

  useEffect(() => {
    if (enabled || !ADMIN_PATHS.some((p) => pathname.startsWith(p))) return;
    if (navigator.maxTouchPoints === 0) return;
    enabled = true;
    import("@dragdroptouch/drag-drop-touch").then(({ enableDragDropTouch }) =>
      enableDragDropTouch(document, document, { isPressHoldMode: true, pressHoldDelayMS: HOLD_MS })
    );
  }, [pathname]);

  return null;
}
