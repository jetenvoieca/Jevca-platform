// Derivatives of a Base work (2026-11-05, Craig's mockup — keeping track
// of editions and unsold stock): what kind each Type is, and an edition
// written as "number/size" (e.g. "3/10") in Artwork.edition, the field
// certificates, exports and the website already show. Plain module,
// shared by the details panel and the actions.

// An Original isn't made as a derivative; every other Type can be.
export function isOriginalType(type: string | null | undefined): boolean {
  return (type ?? "").toLowerCase().includes("original");
}

// An open edition isn't numbered.
export function isOpenEditionType(type: string | null | undefined): boolean {
  return (type ?? "").toLowerCase().includes("open");
}

export function formatEdition(number: number, size: number): string {
  return `${number}/${size}`;
}

// "3/10", "3 / 10" or "3 of 10" → its number and size; null for anything
// else (an old free-text edition, or none).
export function parseEdition(edition: string | null | undefined): { number: number; size: number } | null {
  const match = (edition ?? "").trim().match(/^(\d+)\s*(?:\/|of)\s*(\d+)$/i);
  if (!match) return null;
  const number = Number(match[1]);
  const size = Number(match[2]);
  return number > 0 && size > 0 ? { number, size } : null;
}
