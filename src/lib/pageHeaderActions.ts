"use client";

import { useEffect, useSyncExternalStore } from "react";

// What the site header's page icons do (2026-11-01; Layout 2026-11-03,
// Craig's request): while it can be used, a part of Pages registers an
// action here, and the header's icon shows and calls it — hidden when
// nothing is registered. One at a time each; cleared when it unmounts.
// - the eye (ViewPageButton): back to a page's preview from its Layout
//   or Arrange;
// - Layout (PageLayoutButton): open the selected page's Layout;
// - Theme (PageThemeButton, 2026-11-03): choose a Site Theme to make its
//   pages on the site.
type Action = () => void;

function headerAction() {
  let current: Action | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Action | null) => {
    current = next;
    for (const l of listeners) l();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    // While mounted (and `action` is given), the header's icon calls it.
    useRegister(action: Action | null) {
      useEffect(() => {
        if (!action) return;
        set(action);
        return () => {
          if (current === action) set(null);
        };
      }, [action]);
    },
    // The action registered now, if any.
    useCurrent(): Action | null {
      return useSyncExternalStore(
        subscribe,
        () => current,
        () => null,
      );
    },
  };
}

const viewReturn = headerAction();
const layoutOpen = headerAction();
const themeOpen = headerAction();

export const useRegisterPageViewReturn = viewReturn.useRegister;
export const usePageViewReturn = viewReturn.useCurrent;
export const useRegisterPageLayoutOpen = layoutOpen.useRegister;
export const usePageLayoutOpen = layoutOpen.useCurrent;
export const useRegisterPageThemeOpen = themeOpen.useRegister;
export const usePageThemeOpen = themeOpen.useCurrent;
