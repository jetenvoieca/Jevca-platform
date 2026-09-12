"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMedia, deleteMedia } from "@/lib/actions/mediaCatalogue";
import { addMediaToBucket } from "@/lib/actions/videoEditor";

export type MediaDetail = {
  id: string;
  url: string;
  displayUrl: string;
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
  variant = "catalogue",
  onDiscard,
  discarding = false,
  onClose,
  onArchived,
  onDataChanged,
}: {
  siteId: string;
  media: MediaDetail;
  tagPresets: string[];
  variant?: "catalogue" | "pendingRender";
  onDiscard?: () => void;
  discarding?: boolean;
  // Optional — when the parent manages selection as client-side state
  // (Media Catalogue, 2026-08-08 perf pass) it passes these to update its
  // own state directly instead of a full-page navigation. Falls back to
  // the old router.push behaviour when not provided.
  onClose?: () => void;
  onArchived?: () => void;
  // Called after a successful save (2026-08-11) instead of
  // router.refresh() alone — a plain server refresh doesn't reach data
  // already mounted as client state on the parent, so a saved field could
  // appear to silently revert on the next render even though the save
  // itself worked. Same bug and fix as ArtworkDetailPanel.
  onDataChanged?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [addedToBucket, setAddedToBucket] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [tags, setTags] = useState<string[]>(media.tags);
  const router = useRouter();

  const handleClose = () => {
    if (onClose) onClose();
    else router.push(`/sites/${siteId}/media`);
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const handleDelete = () => {
    // 2026-08-19 — this used to promise the item "can be restored later
    // via Show archived", which was never actually true (no such view
    // exists anywhere in this app). Now says what actually happens.
    if (!confirm("Delete this item permanently? This can't be undone.")) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteMedia(media.id, siteId);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      if (onArchived) {
        onArchived();
      } else {
        router.push(`/sites/${siteId}/media`);
      }
    });
  };

  const [bucketError, setBucketError] = useState<string | null>(null);
  const handleAddToBucket = () => {
    startTransition(async () => {
      const result = await addMediaToBucket(media.id, siteId);
      if (!result.ok) {
        setBucketError(result.error);
        return;
      }
      setBucketError(null);
      setAddedToBucket(true);
    });
  };

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
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
              {deleteError && (
                <p className="w-full text-xs text-red-600">{deleteError}</p>
              )}
              {/* Modal close (2026-09-12, direct request) — an icon
                  reads as "dismiss this overlay" the way a text link
                  labelled "Close" doesn't, and matches the click-outside
                  behaviour the panel now also has. */}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="rounded-md border border-neutral-300 p-1.5 hover:bg-neutral-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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
          src={media.displayUrl}
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
          if (onDataChanged) onDataChanged();
          else router.refresh();
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

        {/* Related to (2026-09-12, direct request) — read-only display of
            which artwork this item is linked to. Not editable here: that
            decision was reconsidered from the original screenshot ask on
            purpose — changing the link still only happens from the
            artwork's own Related Images picker (see the removal note
            this replaces, dated 2026-08-19), so there's still only one
            place that relationship actually gets edited. Only rendered
            when a link exists, so plain Marketing media (never linked to
            an artwork) doesn't show an empty field. */}
        {media.artwork && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Related to</label>
            <p className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              {media.artwork.presentationTitle}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Tags</label>
          <input type="hidden" name="tags" value={tags.join(", ")} />
          {tagPresets.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No tags set up yet — add some under Media Catalogue → Settings.
            </p>
          ) : (
            <div className="space-y-2">
              {/* 2026-08-19, direct request — used to show every preset
                  as a toggle pill, active and inactive mixed together.
                  With only one or two presets set up, an unapplied one
                  sitting there unstyled read as a stray question ("Post
                  this ?") rather than an obviously-clickable option. Now
                  only ever shows tags actually on this item; adding one
                  is a separate, explicit step below. */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        aria-label={`Remove tag ${t}`}
                        className="leading-none text-white/70 hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {tagPresets.some((t) => !tags.includes(t)) && (
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) setTags((prev) => [...prev, value]);
                  }}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-500"
                >
                  <option value="">+ Add a tag…</option>
                  {tagPresets
                    .filter((t) => !tags.includes(t))
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              )}
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
