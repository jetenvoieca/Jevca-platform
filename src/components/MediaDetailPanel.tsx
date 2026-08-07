"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateMedia, archiveMedia } from "@/lib/actions/mediaCatalogue";
import { addMediaToBucket } from "@/lib/actions/videoEditor";

export type MediaDetail = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  caption: string | null;
  altText: string | null;
  tags: string[];
  artworkId: string | null;
  artwork: { id: string; presentationTitle: string } | null;
};

export default function MediaDetailPanel({
  siteId,
  media,
  tagPresets,
  artistArtworks,
}: {
  siteId: string;
  media: MediaDetail;
  tagPresets: string[];
  artistArtworks: { id: string; presentationTitle: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [addedToBucket, setAddedToBucket] = useState(false);
  const router = useRouter();

  const handleArchive = () => {
    if (!confirm("Remove this item from the catalogue? It can be restored later via Show archived.")) return;
    startTransition(async () => {
      await archiveMedia(media.id, siteId);
      router.push(`/sites/${siteId}/media`);
    });
  };

  const handleAddToBucket = () => {
    startTransition(async () => {
      await addMediaToBucket(media.id, siteId);
      setAddedToBucket(true);
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">
          {media.caption || "Untitled"}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddToBucket}
            disabled={isPending || addedToBucket}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {addedToBucket ? "Added to Bucket" : "Add to Bucket"}
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
          <Link
            href={`/sites/${siteId}/media`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Close
          </Link>
        </div>
      </div>

      {media.kind === "VIDEO" ? (
        <video
          src={media.url}
          poster={media.posterUrl || undefined}
          controls
          className="mb-4 w-full rounded-md"
        />
      ) : (
        <img src={media.url} alt="" className="mb-4 w-full rounded-md object-cover" />
      )}

      <form
        action={async (formData) => {
          await updateMedia(media.id, siteId, formData);
          setSaved(true);
          router.refresh();
          setTimeout(() => setSaved(false), 2000);
        }}
        className="space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Caption</label>
          <input
            type="text"
            name="caption"
            defaultValue={media.caption || ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Alt text</label>
          <input
            type="text"
            name="altText"
            defaultValue={media.altText || ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Related Artwork
          </label>
          <select
            name="artworkId"
            defaultValue={media.artworkId || ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">None — Marketing media</option>
            {artistArtworks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.presentationTitle}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            Linking this to an artwork moves it to Related and it'll show under that artwork's
            title in the catalogue. Set back to "None" to make it Marketing media instead.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Tags <span className="font-normal text-neutral-400">(comma separated)</span>
          </label>
          <input
            type="text"
            name="tags"
            defaultValue={media.tags.join(", ")}
            placeholder={tagPresets.slice(0, 3).join(", ") || "e.g. seasonal, campaign"}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Mainly useful for Marketing media, to search/sort by later.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Save
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
