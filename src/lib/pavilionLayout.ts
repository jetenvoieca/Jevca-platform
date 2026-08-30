import type { PavilionTile, PavilionCard, PavilionCurator, PavilionCuratorArtist } from "@/lib/blocks";

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

// Same idea, sized for Curators — deliberately smaller than a Pavilion's
// own default and on a tighter 4-column grid, since several Curators are
// meant to sit together on the same canvas at once when a Pavilion is
// drilled into, not fill the whole space the way a handful of Pavilions
// do. Starts below y:24 so a fresh Curator never lands under the fixed
// "you are here" marker reserved in the top-left corner of the drilled
// view (see DRILL_MARKER in PavilionVisualEditor.tsx / PavilionEditor.tsx).
export function nextCuratorPosition(existingCount: number): Pick<PavilionTile, "x" | "y" | "width" | "height"> {
  const cols = 4;
  const col = existingCount % cols;
  const row = Math.floor(existingCount / cols);
  return { x: 3 + col * 24, y: 26 + row * 28, width: 20, height: 22 };
}

// Backfills any field the shape has gained since this artist/curator/
// card was last saved — PavilionCard has changed shape several times in
// quick succession (x/y/width/height added, curators went from plain
// strings to full records, artists added to Curator) and everything is
// stored as plain JSON with no schema enforcement, so older saved data
// can genuinely be missing fields the current code assumes exist. This
// isn't optional cleanup: without it, e.g. `curator.artists.map(...)` on
// data saved before `artists` existed throws and crashes the whole page
// (2026-08-30 — the actual cause of "This page couldn't load" when
// drilling into an old Curator). Called once, right where `initialCards`
// is first read into state, so every access after that can trust the
// shape is complete without needing its own defensive fallback.
function normalizeArtist(raw: Partial<PavilionCuratorArtist>): PavilionCuratorArtist {
  return {
    id: raw.id ?? crypto.randomUUID(),
    artistId: raw.artistId ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
    imageUrl: raw.imageUrl ?? "",
    x: raw.x ?? 3,
    y: raw.y ?? 26,
    width: raw.width ?? 20,
    height: raw.height ?? 22,
  };
}

function normalizeCurator(raw: Partial<PavilionCurator>): PavilionCurator {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? "",
    description: raw.description ?? "",
    imageId: raw.imageId ?? "",
    imageUrl: raw.imageUrl ?? "",
    x: raw.x ?? 3,
    y: raw.y ?? 26,
    width: raw.width ?? 20,
    height: raw.height ?? 22,
    artists: (raw.artists ?? []).map(normalizeArtist),
  };
}

export function normalizeCard(raw: Partial<PavilionCard> & { id: string; childPageId: string }): PavilionCard {
  return {
    id: raw.id,
    name: raw.name ?? "",
    description: raw.description ?? "",
    imageId: raw.imageId ?? "",
    imageUrl: raw.imageUrl ?? "",
    childPageId: raw.childPageId,
    x: raw.x ?? 4,
    y: raw.y ?? 4,
    width: raw.width ?? 28,
    height: raw.height ?? 32,
    curators: (raw.curators ?? []).map(normalizeCurator),
  };
}

export function normalizeCards(raw: PavilionCard[]): PavilionCard[] {
  return raw.map(normalizeCard);
}
