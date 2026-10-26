// The red SOLD flag on a sold work's picture (2026-10-26, direct request
// — one flag everywhere: the Artwork Catalogue, Curations, Locations, the
// Media Catalogue's Artworks view, and curation works on the website and
// presentations). Paid and unpaid sales both read "Sold" — see isSold in
// lib/artworkFilters.ts. Sits in the picture's top-right corner, so the
// picture's box must be `relative`.
export default function SoldFlag() {
  return (
    <span className="pointer-events-none absolute right-1 top-1 z-10 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Sold
    </span>
  );
}
