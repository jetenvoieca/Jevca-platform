"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createArtwork } from "@/lib/actions/artworks";
import ArtworkDetailPanel, { type ArtworkDetail } from "@/components/ArtworkDetailPanel";

type ArtworkRow = {
  id: string;
  presentationTitle: string;
  presentationPrice: string | null;
  catalogueNumber: string;
  availability: string;
  visible: boolean;
  imageUrl: string | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:artworks-density";

export default function ArtworksCatalogueView({
  siteId,
  artworks,
  q,
  availability,
  visibility,
  sort,
  selected,
}: {
  siteId: string;
  artworks: ArtworkRow[];
  q: string;
  availability: string;
  visibility: string;
  sort: string;
  selected: ArtworkDetail | null;
}) {
  const [view, setView] = useState<"tile" | "list">("tile");
  const [density, setDensity] = useState<(typeof DENSITY_OPTIONS)[number]>(5);

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
    if (visibility) params.set("visibility", visibility);
    if (nextAvailability) params.set("availability", nextAvailability);
    const qs = params.toString();
    return `/sites/${siteId}/artworks${qs ? `?${qs}` : ""}`;
  };

  const soldCount = artworks.filter((a) => a.availability === "SOLD").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">Artwork Catalogue</h1>
        <form action={createArtwork.bind(null, siteId)} className="flex items-center gap-2">
          <input
            type="text"
            name="title"
            required
            placeholder="New artwork title"
            className="w-48 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + New
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            className="w-56 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <input type="hidden" name="availability" value={availability} />
          <select
            name="visibility"
            defaultValue={visibility}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">All visibility</option>
            <option value="shown">Shown</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
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

        <div className="flex items-center gap-3">
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

      <p className="mb-4 text-sm text-neutral-400">
        {artworks.length} work{artworks.length === 1 ? "" : "s"} · {soldCount} sold
      </p>

      {artworks.length === 0 ? (
        <p className="text-sm text-neutral-500">No artworks match.</p>
      ) : view === "tile" ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
        >
          {artworks.map((a) => (
            <Link
              key={a.id}
              href={`/sites/${siteId}/artworks/${a.id}`}
              className={`block rounded-md border-2 p-1 ${
                selected?.id === a.id ? "border-neutral-900" : "border-transparent"
              }`}
            >
              <div className="relative">
                {a.imageUrl ? (
                  <img
                    src={a.imageUrl}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                    No image
                  </div>
                )}
                {a.availability === "SOLD" && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                    Sold
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                {a.presentationTitle}
              </p>
              <p className="text-xs text-neutral-500">
                {a.presentationPrice ? `£${a.presentationPrice}` : "—"}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium"></th>
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Catalogue #</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Availability</th>
              <th className="py-2 font-medium">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((a) => (
              <tr
                key={a.id}
                className={`border-b border-neutral-100 ${
                  selected?.id === a.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                }`}
              >
                <td className="py-2">
                  <Link href={`/sites/${siteId}/artworks/${a.id}`}>
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-neutral-100" />
                    )}
                  </Link>
                </td>
                <td className="py-2 font-medium text-neutral-900">
                  <Link href={`/sites/${siteId}/artworks/${a.id}`}>{a.presentationTitle}</Link>
                </td>
                <td className="py-2 text-neutral-500">{a.catalogueNumber}</td>
                <td className="py-2 text-neutral-500">
                  {a.presentationPrice ? `£${a.presentationPrice}` : "—"}
                </td>
                <td className="py-2 text-neutral-500">{a.availability}</td>
                <td className="py-2 text-neutral-500">{a.visible ? "Shown" : "Hidden"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <ArtworkDetailPanel siteId={siteId} artwork={selected} />}
    </div>
  );
}
