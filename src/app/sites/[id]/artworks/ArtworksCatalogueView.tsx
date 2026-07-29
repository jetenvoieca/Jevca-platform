"use client";

import { useState } from "react";
import Link from "next/link";
import ThreeColumnShell from "@/components/ThreeColumnShell";
import { createArtwork } from "@/lib/actions/artworks";

type ArtworkRow = {
  id: string;
  title: string;
  catalogueNumber: string;
  medium: string | null;
  price: string | null;
  availability: string;
  visible: boolean;
  imageUrl: string | null;
};

export default function ArtworksCatalogueView({
  siteId,
  artworks,
  q,
  availability,
  visibility,
  sort,
}: {
  siteId: string;
  artworks: ArtworkRow[];
  q: string;
  availability: string;
  visibility: string;
  sort: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "tile">("list");
  const selected = artworks.find((a) => a.id === selectedId) || null;

  return (
    <ThreeColumnShell
      preview={
        selected ? (
          <div>
            {selected.imageUrl ? (
              <img
                src={selected.imageUrl}
                alt=""
                className="mb-3 w-full rounded-md object-cover"
              />
            ) : (
              <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                No image
              </div>
            )}
            <h3 className="text-lg font-semibold text-neutral-900">{selected.title}</h3>
            <p className="text-sm text-neutral-500">#{selected.catalogueNumber}</p>
            {selected.price && (
              <p className="mt-2 text-sm text-neutral-700">£{selected.price}</p>
            )}
            <p className="text-xs uppercase text-neutral-400">{selected.availability}</p>
            <Link
              href={`/sites/${siteId}/artworks/${selected.id}`}
              className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Edit Artwork →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Select an artwork to preview it here.</p>
        )
      }
      edit={
        <div>
          <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Artworks</h1>

          <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search title, catalogue #, medium"
              className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              name="availability"
              defaultValue={availability}
              className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="">All availability</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
            </select>
            <select
              name="visibility"
              defaultValue={visibility}
              className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="">All visibility</option>
              <option value="shown">Shown</option>
              <option value="hidden">Hidden</option>
            </select>
            <select
              name="sort"
              defaultValue={sort}
              className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="">Sort: Date added</option>
              <option value="title">Sort: Title</option>
              <option value="price">Sort: Price</option>
            </select>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Apply
            </button>
          </form>

          {artworks.length === 0 ? (
            <p className="text-sm text-neutral-500">No artworks match.</p>
          ) : view === "tile" ? (
            <div className="grid grid-cols-3 gap-4">
              {artworks.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`rounded-md border-2 p-1 text-left ${
                    selectedId === a.id ? "border-neutral-900" : "border-transparent"
                  }`}
                >
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
                  <p className="mt-1 truncate text-sm font-medium text-neutral-900">{a.title}</p>
                  <p className="text-xs text-neutral-500">
                    {a.price ? `£${a.price}` : "—"} · {a.availability}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 font-medium"></th>
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Catalogue #</th>
                  <th className="py-2 font-medium">Medium</th>
                  <th className="py-2 font-medium">Price</th>
                  <th className="py-2 font-medium">Availability</th>
                  <th className="py-2 font-medium">Visibility</th>
                </tr>
              </thead>
              <tbody>
                {artworks.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`cursor-pointer border-b border-neutral-100 ${
                      selectedId === a.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <td className="py-2">
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-neutral-100" />
                      )}
                    </td>
                    <td className="py-2 font-medium text-neutral-900">{a.title}</td>
                    <td className="py-2 text-neutral-500">{a.catalogueNumber}</td>
                    <td className="py-2 text-neutral-500">{a.medium || "—"}</td>
                    <td className="py-2 text-neutral-500">{a.price ? `£${a.price}` : "—"}</td>
                    <td className="py-2 text-neutral-500">{a.availability}</td>
                    <td className="py-2 text-neutral-500">{a.visible ? "Shown" : "Hidden"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      }
      menu={
        <div className="space-y-4">
          <form action={createArtwork.bind(null, siteId)} className="space-y-2">
            <input
              type="text"
              name="title"
              required
              placeholder="New artwork title"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              + Add New Artwork
            </button>
          </form>

          <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex-1 px-3 py-1.5 ${
                view === "list" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView("tile")}
              className={`flex-1 px-3 py-1.5 ${
                view === "tile" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
              }`}
            >
              Tile
            </button>
          </div>

          <p className="text-xs text-neutral-400">
            {artworks.length} artwork{artworks.length === 1 ? "" : "s"}
          </p>
        </div>
      }
    />
  );
}
