// A small grey star before a Base work's catalogue number (2026-11-01,
// Craig's request) — a work others are derived from (Artwork.isBase).
export default function BaseStar({ isBase }: { isBase: boolean }) {
  if (!isBase) return null;
  return (
    <span title="Base" aria-label="Base" className="mr-0.5 text-neutral-400">
      ★
    </span>
  );
}
