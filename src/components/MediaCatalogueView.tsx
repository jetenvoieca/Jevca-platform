"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { uploadImage } from "@/lib/actions/media";
import MediaDetailPanel, { type MediaDetail } from "@/components/MediaDetailPanel";

type MediaRow = {
  id: string;
  url: string;
  kind: string;
  caption: string | null;
  artwork: { id: string; presentationTitle: string } | null;
};

const DENSITY_OPTIONS = [3, 5, 7, 9] as const;
const DENSITY_STORAGE_KEY = "jevca:media-density";

export default function MediaCatalogueView({
  siteId,
  artistId,
  media,
  purpose,
  q,
  tag,
  artworkId,
  sort,
  counts,
  tagPresets,
  artistArtworks,
  selected,
}: {
  siteId: string;
  artistId: string;
  media: MediaRow[];
  purpose: "marketing" | "related";
  q: string;
  tag: string;
  artworkId: string;
  sort: string;
  counts: { marketing: number; related: number };
  tagPresets: string[];
  artistArtworks: { id: string; presentationTitle: string }[];
  selected: MediaDetail | null;
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

  const toggleHref = (nextPurpose: "marketing" | "related") =>
    `/sites/${siteId}/media?purpose=${nextPurpose}`;

  const tileHref = (mediaId: string) => {
    const sp = new URLSearchParams({ purpose });
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    if (artworkId) sp.set("artworkId", artworkId);
    return `/sites/${siteId}/media/${mediaId}?${sp.toString()}`;
  };

  return (
    <div className="px-6 py-4">
      <div
        className={selected ? "grid items-start gap-6" : ""}
        style={selected ? { gridTemplateColumns: "1fr 480px" } : undefined}
      >
        <div>
          {/* Row 1: title + view controls — same pattern as the Artwork
              Catalogue, both govern how the whole catalogue displays. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>

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

          {/* Row 2: Marketing/Related toggle + filtering. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm">
              <Link
                href={toggleHref("marketing")}
                className={`px-4 py-1.5 ${
                  purpose === "marketing" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                }`}
              >
                Marketing
              </Link>
              <Link
                href={toggleHref("related")}
                className={`px-4 py-1.5 font-medium ${
                  purpose === "related"
                    ? "bg-neutral-900 text-white"
                    : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                }`}
              >
                Related ({counts.related})
              </Link>
            </div>

            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="purpose" value={purpose} />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search caption, alt text"
                className="w-44 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
              {purpose === "marketing" ? (
                <select
                  name="tag"
                  defaultValue={tag}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All tags</option>
                  {tagPresets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  name="artworkId"
                  defaultValue={artworkId}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All artworks</option>
                  {artistArtworks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.presentationTitle}
                    </option>
                  ))}
                </select>
              )}
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">Sort: Date added</option>
                <option value="caption">Sort: Caption</option>
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
            {media.length} item{media.length === 1 ? "" : "s"}
          </p>

          {view === "tile" ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${density}, minmax(0, 1fr))` }}
            >
              {media.map((m) => (
                <Link
                  key={m.id}
                  href={tileHref(m.id)}
                  className={`block rounded-md border-2 p-1 ${
                    selected?.id === m.id ? "border-neutral-900" : "border-transparent"
                  }`}
                >
                  {m.kind === "VIDEO" ? (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-200 text-xs text-neutral-500">
                      Video
                    </div>
                  ) : (
                    <img
                      src={m.url}
                      alt=""
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  )}
                  <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                    {m.caption || "Untitled"}
                  </p>
                  {m.artwork && (
                    <p className="truncate text-xs font-medium text-rose-600">
                      → {m.artwork.presentationTitle}
                    </p>
                  )}
                </Link>
              ))}
              <AddNewTile artistId={artistId} siteId={siteId} />
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 font-medium"></th>
                  <th className="py-2 font-medium">Caption</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium">Related Artwork</th>
                </tr>
              </thead>
              <tbody>
                {media.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-neutral-100 ${
                      selected?.id === m.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <td className="py-2">
                      <Link href={tileHref(m.id)}>
                        {m.kind === "VIDEO" ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-neutral-200 text-[9px] text-neutral-500">
                            Video
                          </div>
                        ) : (
                          <img src={m.url} alt="" className="h-10 w-10 rounded object-cover" />
                        )}
                      </Link>
                    </td>
                    <td className="py-2 font-medium text-neutral-900">
                      <Link href={tileHref(m.id)}>{m.caption || "Untitled"}</Link>
                    </td>
                    <td className="py-2 text-neutral-500">{m.kind === "VIDEO" ? "Video" : "Photo"}</td>
                    <td className="py-2 text-rose-600">
                      {m.artwork ? m.artwork.presentationTitle : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-neutral-100">
                  <td colSpan={4} className="py-2">
                    <AddNewRow artistId={artistId} siteId={siteId} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="sticky top-4">
            <MediaDetailPanel
              siteId={siteId}
              media={selected}
              tagPresets={tagPresets}
              artistArtworks={artistArtworks}
            />
          </div>
        )}
      </div>
    </div>
  );
}

async function handleFileUpload(
  file: File,
  artistId: string,
  siteId: string
) {
  const formData = new FormData();
  formData.set("file", file);
  await uploadImage(artistId, formData);
  window.location.href = `/sites/${siteId}/media`;
}

// Replaces the old toolbar "+ Upload" button — sits as the last grid tile
// instead, same "click straight in, no form fields first" pattern as
// Artworks' "+ Add New" tile. Still needs a real file picked (unlike an
// artwork, media can't exist without one), so this opens the file dialog
// directly rather than creating anything blank first.
function AddNewTile({ artistId, siteId }: { artistId: string; siteId: string }) {
  return (
    <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600">
      + Add New
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, artistId, siteId);
        }}
      />
    </label>
  );
}

// Same "+ Add New" action, as a row for List view.
function AddNewRow({ artistId, siteId }: { artistId: string; siteId: string }) {
  return (
    <label className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
      + Add New
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, artistId, siteId);
        }}
      />
    </label>
  );
}
