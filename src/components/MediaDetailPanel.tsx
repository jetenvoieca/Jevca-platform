"use client";

import { useState, useTransition, useEffect } from "react";
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
  variant = "catalogue",
  onDiscard,
  discarding = false,
  onClose,
  onArchived,
}: {
  siteId: string;
  media: MediaDetail;
  tagPresets: string[];
  artistArtworks: { id: string; presentationTitle: string }[];
  variant?: "catalogue" | "pendingRender";
  onDiscard?: () => void;
  discarding?: boolean;
  // Optional — when the parent manages selection as client-side state
  // (Media Catalogue, 2026-08-08 perf pass) it passes these to update its
  // own state directly instead of a full-page navigation. Falls back to
  // the old Link/router.push behaviour when not provided.
  onClose?: () => void;
  onArchived?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [addedToBucket, setAddedToBucket] = useState(false);
  // TEMP DEBUG (2026-08-09) — remove once diagnosed.
  useEffect(() => {
    console.log("[DEBUG] MediaDetailPanel MOUNTED for media.id:", media.id, "initial addedToBucket:", false);
    return () => console.log("[DEBUG] MediaDetailPanel UNMOUNTED for media.id:", media.id);
  }, [media.id]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [tags, setTags] = useState<string[]>(media.tags);
  const router = useRouter();

  const handleArchive = () => {
    if (!confirm("Remove this item from the catalogue? It can be restored later via Show archived.")) return;
    startTransition(async () => {
      await archiveMedia(media.id, siteId);
      if (onArchived) {
        onArchived();
      } else {
        router.push(`/sites/${siteId}/media`);
      }
    });
  };

  const [bucketError, setBucketError] = useState<string | null>(null);
  const handleAddToBucket = () => {
    console.log("[DEBUG] handleAddToBucket clicked for media.id:", media.id);
    startTransition(async () => {
      const result = await addMediaToBucket(media.id, siteId);
      console.log("[DEBUG] addMediaToBucket result for media.id:", media.id, "->", result);
      if (!result.ok) {
        setBucketError(result.error);
        return;
      }
      setBucketError(null);
      setAddedToBucket(true);
      console.log("[DEBUG] setAddedToBucket(true) called for media.id:", media.id);
    });
  };

  console.log("[DEBUG] MediaDetailPanel RENDER for media.id:", media.id, "addedToBucket:", addedToBucket, "isPending:", isPending);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      {variant === "catalogue" && (
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">{media.caption || "Untitled"}</h2>
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
                onClick={(e) => {
                  if (onClose) {
                    e.preventDefault();
                    onClose();
                  }
                }}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Close
              </Link>
            </div>
          </div>
          {bucketError && <p className="mt-2 text-xs text-red-600">{bucketError}</p>}
        </div>
      )}

      {media.kind === "VIDEO" ? (
        videoPlaying ? (
          <video
            src={media.url}
            controls
            autoPlay
            className="mb-1 w-full rounded-md"
            onEnded={() => setVideoPlaying(false)}
          />
        ) : (
          <div className="group relative mb-1 cursor-pointer" onClick={() => setVideoPlaying(true)}>
            <video
              src={media.url}
              poster={media.posterUrl || undefined}
              muted
              disablePictureInPicture
              disableRemotePlayback
              className="pointer-events-none w-full rounded-md"
            />
            {/* Always-visible play badge — without this a paused video is
                indistinguishable from a photo at rest (2026-08-08). */}
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/10 transition group-hover:bg-black/30">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white transition group-hover:bg-black/80">
                <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-6 w-6">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </div>
          </div>
        )
      ) : (
        <img
          src={media.url}
          alt=""
          className="mb-1 w-full cursor-zoom-in rounded-md object-cover"
          onClick={() => setLightboxOpen(true)}
        />
      )}
      <p className="mb-4 text-xs text-neutral-400">
        {media.kind === "VIDEO"
          ? videoPlaying
            ? "Playing."
            : "Click to play, right here."
          : "Click to view full size."}
      </p>

      {/* Lightbox — photos only now (2026-08-08). Video used to open here
          too, but that was full-screen, and the actual requirement was
          always to play inline in the editor without leaving the page —
          see the inline video block above instead. */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={media.url}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-6 top-6 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Close ✕
          </button>
        </div>
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
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Tags</label>
          <input type="hidden" name="tags" value={tags.join(", ")} />
          {tagPresets.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No tags set up yet — add some under Media Catalogue → Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagPresets.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setTags((prev) =>
                        active ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
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
          {variant === "pendingRender" && onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={discarding}
              className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {discarding ? "Discarding…" : "Discard"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
