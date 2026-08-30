import type { PavilionTile } from "@/lib/blocks";

// Plain utility, deliberately NOT in pavilions.ts ("use server") — same
// reason as pageSlug.ts's slugify: a synchronous helper can't be an
// export of a Server Actions file. Used both server-side (when a card
// is created) and client-side (PavilionEditor's own live preview),
// which a plain module here supports either way.
//
// Simple auto-placement so a freshly added Pavilion doesn't land exactly
// on top of an existing one — three loose columns, filled in creation
// order. Purely a starting point: every card is freely
// draggable/resizable on the canvas straight after this.
export function nextCardPosition(existingCount: number): Pick<PavilionTile, "x" | "y" | "width" | "height"> {
  const col = existingCount % 3;
  const row = Math.floor(existingCount / 3);
  return { x: 4 + col * 33, y: 4 + row * 36, width: 28, height: 32 };
}

// Same idea, sized for Curators (2026-08-30) — deliberately smaller than
// a Pavilion's own default and on a tighter 4-column grid, since several
// Curators are meant to sit together on the same canvas at once when a
// Pavilion is drilled into, not fill the whole space the way a handful
// of Pavilions do. Starts below y:24 so a fresh Curator never lands
// under the fixed "you are here" Pavilion marker reserved in the
// top-left corner of the drilled view (see PAVILION_MARKER in
// PavilionVisualEditor.tsx / PavilionEditor.tsx).
export function nextCuratorPosition(existingCount: number): Pick<PavilionTile, "x" | "y" | "width" | "height"> {
  const cols = 4;
  const col = existingCount % cols;
  const row = Math.floor(existingCount / cols);
  return { x: 3 + col * 24, y: 26 + row * 28, width: 20, height: 22 };
}
