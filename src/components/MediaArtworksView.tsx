"use client";

import { useState } from "react";
import Link from "next/link";
import { listArtworks, type ArtworkListRow } from "@/lib/actions/artworks";
import { getArtworkImagesForMedia } from "@/lib/actions/mediaCatalogue";
import type { CurationSummary } from "@/lib/actions/curations";
import type { ArtworkImage } from "@/lib/artworkImages";
import ArtworkFilterBar, { type ArtworkFilterValues } from "@/components/ArtworkFilterBar";
import MediaCatalogueTabs from "@/components/MediaCatalogueTabs";
import ImageFill from "@/components/ImageFill";
import { useBackdropClose } from "@/lib/useBackdropClose";

// The Media Catalogue's Artworks view (2026-10-15, direct request): the
// catalogue's works, to look at and pick from for mailings, PR and
// social — read only. Every work is shown, sold ones marked. Filters are
// the Artwork Catalogue's own (ArtworkFilterBar). Opening a work shows
// its images and name, with a button to the work in the Artwork
// Catalogue, where it is edited.
export default function MediaArtworksView({
  siteId,
  artistId,
  artworks: initialArtworks,
  total: initialTotal,
  pageSize,
  filters: initialFilters,
  curations,
  names,
  locations,
  types,
  relatedCount,
}: {
  siteId: string;
  artistId: string;
  artworks: ArtworkListRow[];
  total: number;
  pageSize: number;
  filters: ArtworkFilterValues;
  curations: CurationSummary[];
  names: string[];
  locations: string[];
  types: string[];
  relatedCount: number;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [artworks, setArtworks] = useState(initialArtworks);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<{
    id: string;
    catalogueName: string;
    images: ArtworkImage[];
  } | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const backdrop = useBackdropClose(() => setOpen(null));

  const listFilters = (f: ArtworkFilterValues) => ({
    curation: f.curation || undefined,
    name: f.name || undefined,
    location: f.location || undefined,
    type: f.type || undefined,
    sort: f.sort || undefined,
  });

  const applyFilters = async (change: Partial<ArtworkFilterValues>) => {
    const next = { ...filters, ...change };
    setFilters(next);
    const { rows, total: newTotal } = await listArtworks(artistId, {
      ...listFilters(next),
      limit: pageSize,
    });
    setArtworks(rows);
    setTotal(newTotal);
    // Kept in the address, so a reload shows the same view.
    const params = new URLSearchParams({ purpose: "artworks" });
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { rows } = await listArtworks(artistId, {
        ...listFilters(filters),
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [...prev, ...rows]);
    } finally {
      setLoadingMore(false);
    }
  };

  const openArtwork = async (id: string) => {
    const artwork = await getArtworkImagesForMedia(artistId, id);
    if (!artwork) return;
    setOpen(artwork);
    setActiveImageId(artwork.images[0]?.id ?? null);
  };

  const activeImage = open?.images.find((i) => i.id === activeImageId) ?? null;

  return (
    <div className="px-6 py-4">
      <div className="sticky top-0 z-10 -mt-4 space-y-3 border-b border-neutral-200 bg-white pb-3 pt-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>
        <div className="flex flex-wrap items-center gap-3">
          <MediaCatalogueTabs siteId={siteId} current="artworks" relatedCount={relatedCount} />
          <ArtworkFilterBar
            values={filters}
            curations={curations}
            names={names}
            locations={locations}
            types={types}
            onChange={applyFilters}
          />
        </div>
      </div>

      <p className="mb-3 mt-3 text-sm text-neutral-400">
        {artworks.length} of {total} work{total === 1 ? "" : "s"}
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {artworks.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => openArtwork(a.id)}
            className="block w-full rounded-md border-2 border-transparent p-1 text-left hover:border-neutral-200"
          >
            <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
              {a.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
              {a.availability !== "AVAILABLE" && (
                <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Sold
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm font-medium text-neutral-900">{a.catalogueName}</p>
          </button>
        ))}
      </div>

      {artworks.length < total && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
          <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-900">{open.catalogueName}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/sites/${siteId}/artworks?selected=${open.id}`}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                >
                  Catalogue
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>

            {open.images.length === 0 ? (
              <p className="text-sm text-neutral-400">This work has no images yet.</p>
            ) : (
              <>
                <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                  {activeImage && <ImageFill image={activeImage} large />}
                </div>
                {open.images.length > 1 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {open.images.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setActiveImageId(img.id)}
                        className={`aspect-square overflow-hidden rounded-md ${
                          img.id === activeImageId ? "ring-2 ring-neutral-900" : ""
                        }`}
                      >
                        <ImageFill image={img} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
