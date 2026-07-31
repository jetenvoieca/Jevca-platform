"use client";

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
      <h1 className="mb-3 text-2xl font-semibold text-neutral-900">Media Catalogue</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
            className="w-48 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
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

        <div className="ml-auto">
          <UploadButton artistId={artistId} siteId={siteId} />
        </div>
      </div>

      <p className="mb-4 text-sm text-neutral-400">
        {media.length} item{media.length === 1 ? "" : "s"}
      </p>

      <div
        className={selected ? "grid items-start gap-6" : ""}
        style={selected ? { gridTemplateColumns: "1fr 480px" } : undefined}
      >
        <div>
          {media.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {purpose === "marketing"
                ? "No marketing media yet — upload one above."
                : "No media related to an artwork yet."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
            </div>
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

function UploadButton({ artistId, siteId }: { artistId: string; siteId: string }) {
  return (
    <label className="cursor-pointer rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
      + Upload
      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const formData = new FormData();
          formData.set("file", file);
          await uploadImage(artistId, formData);
          window.location.href = `/sites/${siteId}/media`;
        }}
      />
    </label>
  );
}
