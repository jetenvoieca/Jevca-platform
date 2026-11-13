// The Artist App's Concierge (2026-11-13, Craig's mockup): the kinds of
// request an artist can send; each request goes to their Hopper as a note
// (HopperNote.kind), with at most one picture.
export const CONCIERGE_KINDS = [
  { key: "artwork", label: "Add / edit an Artwork" },
  { key: "rearrange", label: "Rearrange artworks on a page" },
  { key: "pages", label: "Reorder pages" },
  { key: "statement", label: "Update my Artist statement" },
  { key: "biography", label: "Update my Biography" },
  { key: "galleries", label: "Update my list of Galleries" },
  { key: "exhibitions", label: "Add / edit my exhibition listings" },
  { key: "other", label: "Anything else?" },
] as const;

export type ConciergeKind = (typeof CONCIERGE_KINDS)[number]["key"];

export function conciergeKindLabel(key: string | null): string | null {
  return CONCIERGE_KINDS.find((k) => k.key === key)?.label ?? null;
}

export const CONCIERGE_MAX_LENGTH = 5000;

// The kinds that update a Profile Catalogue entry (2026-11-13, Craig): the
// artist edits the entry as it is (Galleries: its galleries' names, one
// per line) and sends it; Administration → Concierge checks it and updates
// the entry (ConciergeProfileTask). `placeholder` for the artist's box.
export const CONCIERGE_PROFILE_KINDS = {
  statement: { entry: "STATEMENT", placeholder: "Your artist statement" },
  biography: { entry: "BIOGRAPHY", placeholder: "Your biography" },
  galleries: { entry: "GALLERIES", placeholder: "Your galleries, one per line" },
} as const;

export type ConciergeProfileKind = keyof typeof CONCIERGE_PROFILE_KINDS;

export function isConciergeProfileKind(kind: string): kind is ConciergeProfileKind {
  return kind in CONCIERGE_PROFILE_KINDS;
}

// A request as its artist sees it.
export type ConciergeRequest = {
  id: string;
  kind: string;
  text: string;
  imageUrl: string | null;
  createdAt: string;
  done: boolean;
};
