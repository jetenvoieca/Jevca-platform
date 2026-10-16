"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A page's own heading, shown in the shell's top band (between the site
// name and the buttons on the right) rather than in the page itself
// (2026-10-16, Craig's mockup for the Hopper). The shell wraps its
// content in PageHeadingProvider and places PageHeadingSlot in the band;
// a page renders <PageHeading> anywhere and it appears there.
const SlotContext = createContext<{
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
} | null>(null);

export function PageHeadingProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ node, setNode }}>{children}</SlotContext.Provider>;
}

export function PageHeadingSlot() {
  const slot = useContext(SlotContext);
  return <div ref={slot?.setNode} className="flex min-w-0 items-center justify-center gap-3" />;
}

export function PageHeading({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  if (!slot?.node) return null;
  return createPortal(children, slot.node);
}
