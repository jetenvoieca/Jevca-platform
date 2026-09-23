"use client";

import { useRef, type MouseEvent } from "react";

// Closes a modal when its dark backdrop is clicked (2026-09-23, "clicking
// off a modal should close it"). Spread the result onto the backdrop
// element: <div className="fixed inset-0 ..." {...backdrop}>.
//
// Only a click that both starts and ends on the backdrop itself counts —
// not one on the modal's own content, and not a text selection dragged
// from inside the modal and released outside it, which would otherwise
// close it and lose whatever was being typed.
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
      pressedOnBackdrop.current = false;
    },
  };
}
