import type { PavilionCard } from "@/lib/blocks";

// Plain utility, deliberately NOT in pavilions.ts ("use server") — same
// reason as pageSlug.ts's slugify: a synchronous helper can't be an
// export of a Server Actions file. Used both server-side (when a card
// is created) and client-side (PavilionEditor's own live preview),
// which a plain module here supports either way.
//
// Simple auto-placement so a freshly added card doesn't land exactly on
// top of an existing one — three loose columns, filled in creation
// order. Purely a starting point: every card is freely
// draggable/resizable on the canvas straight after this.
export function nextCardPosition(
  existingCount: number
): Pick<PavilionCard, "x" | "y" | "width" | "height"> {
  const col = existingCount % 3;
  const row = Math.floor(existingCount / 3);
  return { x: 4 + col * 33, y: 4 + row * 36, width: 28, height: 32 };
}
