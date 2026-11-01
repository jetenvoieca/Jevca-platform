"use client";

import { useEffect, useSyncExternalStore } from "react";

// The way back to a page's preview from its Layout or Arrange (2026-11-01,
// Craig's request): while one is open in Pages it registers how to close
// itself here, and the site header's eye (ViewPageButton) shows and calls
// it. One at a time; cleared when it closes.
type Close = () => void;

let current: Close | null = null;
const listeners = new Set<() => void>();

function set(next: Close | null) {
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// While mounted (and `close` is given), the header's eye calls `close`.
export function useRegisterPageViewReturn(close: Close | null) {
  useEffect(() => {
    if (!close) return;
    set(close);
    return () => {
      if (current === close) set(null);
    };
  }, [close]);
}

// The close registered now, if any.
export function usePageViewReturn(): Close | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
