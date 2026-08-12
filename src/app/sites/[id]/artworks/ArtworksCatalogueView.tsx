"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createArtwork, getArtworkDetailForClient, listArtworks } from "@/lib/actions/artworks";
import ArtworkImportPanel from "@/components/ArtworkImportPanel";
import ArtworkDetailPanel, {
  type ArtworkDetail,
  type ArtworkSettings,
} from "@/components/ArtworkDetailPanel";

type ArtworkRow = {
  id: string;
  presentationTitle: string;
  presentationPrice: string | null;
  catalogueNumber: string;
  availability: string;
  imageUrl: string | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:artworks-density";

export default function ArtworksCatalogueView({
  siteId,
  artistId,
  artworks: initialArtworks,
  total,
  soldCount,
  pageSize,
  q,
  availability,
  location,
  type,
  group,
  sort,
  initialSelected,
  settings,
  siteDefaultCurrency = "GBP",
}: {
  siteId: string;
  artistId: string;
  artworks: ArtworkRow[];
  total: number;
  soldCount: number;
  pageSize: number;
  q: string;
  availability: string;
  location: string;
  type: string;
  group: string;
  sort: string;
  initialSelected: ArtworkDetail | null;
  settings: ArtworkSettings;
  siteDefaultCurrency?: string;
}) {
  const [view, setView] = useState<"tile" | "list">("tile");
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);
  const [showImport, setShowImport] = useState(false);
  const [artworks, setArtworks] = useState<ArtworkRow[]>(initialArtworks);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = artworks.length < total;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const { rows } = await listArtworks(artistId, {
        q: q || undefined,
        availability: availability || undefined,
        location: location || undefined,
        type: type || undefined,
        group: group || undefined,
        sort: sort || undefined,
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [
        ...prev,
        ...rows.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          catalogueNumber: a.catalogueNumber,
          availability: a.availability,
          imageUrl: a.images[0]?.url ?? null,
        })),
      ]);
    } finally {
      setLoadingMore(false);
    }
  };

  // Selecting an artwork used to navigate to a whole separate route,
  // which re-ran this component from scratch on every click — the direct
  // cause of the density flicker reported 2026-08-11 (density starts at
  // its default and only catches up to the real, stored value after a
  // fresh mount's effect runs), on top of being needlessly slow. Fixed
  // exactly like the same issue on Media Catalogue: selection is now
  // local state, fetching only the one clicked artwork.
  const [selected, setSelected] = useState<ArtworkDetail | null>(initialSelected);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const updateUrlSelected = (artworkId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (artworkId) params.set("selected", artworkId);
    else params.delete("selected");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const handleSelect = (artworkId: string) => {
    if (selectingId) return;
    setSelectingId(artworkId);
    (async () => {
      const item = await getArtworkDetailForClient(artworkId);
      if (item && item.artistId === artistId) {
        setSelected(item);
        updateUrlSelected(artworkId);
      }
      setSelectingId(null);
    })();
  };

  const handleClosePanel = () => {
    setSelected(null);
    updateUrlSelected(null);
  };

  const handleDeletedPanel = () => {
    if (selected) setArtworks((prev) => prev.filter((a) => a.id !== selected.id));
    setSelected(null);
    updateUrlSelected(null);
  };

  // After any save inside the panel — re-fetches this one artwork fresh
  // rather than relying on router.refresh(), which re-renders the server
  // tree but can't reach this already-mounted client state (2026-08-11;
  // see the matching note on ArtworkDetailPanel's onDataChanged prop).
  const refreshSelected = () => {
    if (!selected) return;
    (async () => {
      const item = await getArtworkDetailForClient(selected.id);
      if (item && item.artistId === artistId) setSelected(item);
    })();
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (DENSITY_OPTIONS.includes(parsed as (typeof DENSITY_OPTIONS)[number])) {
      setDensity(parsed as (typeof DENSITY_OPTIONS)[number]);
    }
  }, []);

  const setDensityAndStore = (n: (typeof DENSITY_OPTIONS)[number]) => {
    setDensity(n);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, String(n));
  };

  const chipHref = (nextAvailability: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (location) params.set("location", location);
    if (type) params.set("type", type);
    if (group) params.set("group", group);
    if (nextAvailability) params.set("availability", nextAvailability);
    const qs = params.toString();
    return `/sites/${siteId}/artworks${qs ? `?${qs}` : ""}`;
  };

  const addNewTile = (
    <form action={createArtwork.bind(null, artistId, siteId)}>
      <button
        type="submit"
        className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + Add New
      </button>
    </form>
  );

  return (
    <div className="px-6 py-4">
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "1fr 480px" }}>
        <div>
          {/* Row 1: title + view controls, together since they both govern
              how the whole catalogue displays. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">Artwork Catalogue</h1>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Import from CSV
              </button>

              <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
                <button
                  type="button"
                  onClick={() => setView("tile")}
                  className={`px-3 py-1.5 ${
                    view === "tile" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  Tile
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`px-3 py-1.5 ${
                    view === "list" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                  }`}
                >
                  List
                </button>
              </div>

              {view === "tile" && (
                <div className="flex items-center gap-1 text-sm text-neutral-500">
                  <span>Per row</span>
                  {DENSITY_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDensityAndStore(n)}
                      className={`h-7 w-7 rounded-md text-sm ${
                        density === n
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: filtering/search — a separate functional group from
              the view controls above. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <Link
                href={chipHref("")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  !availability
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                All
              </Link>
              <Link
                href={chipHref("AVAILABLE")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  availability === "AVAILABLE"
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                Available
              </Link>
              <Link
                href={chipHref("SOLD")}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  availability === "SOLD"
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                Sold
              </Link>
            </div>

            <form method="get" className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search title, catalogue #, medium"
                className="w-44 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <input type="hidden" name="availability" value={availability} />
              <select
                name="location"
                defaultValue={location}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">All locations</option>
                {settings.artworkLocations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                name="type"
                defaultValue={type}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">All types</option>
                {settings.artworkTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                name="group"
                defaultValue={group}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">All groups</option>
                {settings.artworkGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">Sort: Date added</option>
                <option value="">Sort: Date added</option>
                <option value="title">Sort: Title</option>
                <option value="price">Sort: Price</option>
              </select>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Apply
              </button>
            </form>
          </div>

          <p className="mb-3 text-sm text-neutral-400">
            {artworks.length} of {total} work{total === 1 ? "" : "s"} · {soldCount} sold
          </p>

          {view === "tile" ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
            >
              {artworks.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelect(a.id)}
                  disabled={selectingId === a.id}
                  className={`block w-full rounded-md border-2 p-1 text-left ${
                    selected?.id === a.id ? "border-neutral-900" : "border-transparent"
                  } ${selectingId === a.id ? "opacity-60" : ""}`}
                >
                  <div className="relative">
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt=""
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ) : (
