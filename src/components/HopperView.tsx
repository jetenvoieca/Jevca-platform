"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  binHopperItem,
  addHopperItemToMedia,
  addHopperItemToArtwork,
  updateHopperCaption,
} from "@/lib/actions/hopper";
import { quickCreateArtwork } from "@/lib/actions/media";
import { uploadFileDirect } from "@/lib/uploadDirect";
import ArtworkPicker from "@/components/ArtworkPicker";

export type HopperItem = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  caption: string | null;
  altText: string | null;
  tags: string[];
  createdAt: string;
};

// A running, session-only log of what's just been done — pure visual
// confirmation ("did that just work"), not persisted anywhere. Cleared
// on refresh or via the "Clear list" button.
type ProcessedEntry = {
  key: string;
  thumbUrl: string;
  kind: string;
  label: string;
  // Where this item actually ended up — its own Media Catalogue page, or
  // the artwork it was linked to/created. Null for "Binned", since an
  // archived item has no edit panel to jump to.
  href: string | null;
};

// Persisted per artist so the Processed trail survives navigating away
// and back (it was previously plain component state, which reset on
// unmount — see decisions log, 2026-08-05). Same localStorage pattern
// already used for the Media Catalogue's density preference.
const processedLogKey = (artistId: string) => `jevca:hopper-processed:${artistId}`;

export default function HopperView({
  siteId,
  artistId,
  queue,
  tagPresets,
}: {
  siteId: string;
  artistId: string;
  queue: HopperItem[];
  tagPresets: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addUploading, setAddUploading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [processedLog, setProcessedLog] = useState<ProcessedEntry[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory/directory aren't part of React's typed HTML
  // attributes, so they're set imperatively here rather than as JSX
  // props — sidesteps any TypeScript strict-mode complaint about an
  // unrecognised attribute (this project has hit real strict-mode build
  // failures before over exactly this category of thing).
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "true");
    folderInputRef.current?.setAttribute("directory", "true");
  }, []);

  // Load whatever was left from a previous visit, once, on mount — kept
  // as a separate effect (rather than reading localStorage directly in
  // useState's initializer) so this stays SSR-safe: the server render
  // and the client's first render both start from [], avoiding a
  // hydration mismatch, then this fills it in immediately after.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(processedLogKey(artistId));
      if (stored) setProcessedLog(JSON.parse(stored));
    } catch {
      // Corrupt or unavailable storage — just start with an empty log.
    }
  }, [artistId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(processedLogKey(artistId), JSON.stringify(processedLog));
    } catch {
      // Storage full/unavailable — non-critical, the log just won't
      // persist this time.
    }
  }, [processedLog, artistId]);

  const current = queue.find((i) => i.id === selectedId) ?? queue[0] ?? null;
  const remaining = queue.filter((i) => i.id !== current?.id);

  const logProcessed = (item: HopperItem, label: string, href: string | null) => {
    setProcessedLog((prev) => [
      {
        key: `${item.id}-${Date.now()}`,
        thumbUrl: item.kind === "VIDEO" ? item.posterUrl || "" : item.url,
        kind: item.kind,
        label,
        href,
      },
      ...prev,
    ]);
  };

  // After any sort action, drop back to "no explicit selection" so the
  // next render (post-refresh, with this item now gone from the queue)
  // naturally falls forward to the new oldest item — the auto-advance
  // flick-through rhythm from the original spec, without needing to
  // track index positions by hand.
  const advanceAfterAction = () => {
    setSelectedId(null);
    router.refresh();
  };

  const handleBin = (item: HopperItem) => {
    startTransition(async () => {
      await binHopperItem(item.id, siteId);
      logProcessed(item, "Binned", null);
      advanceAfterAction();
    });
  };

  const handleAddToMedia = (item: HopperItem) => {
    startTransition(async () => {
      await addHopperItemToMedia(item.id, siteId);
      logProcessed(item, "Added to Media Catalogue", `/sites/${siteId}/media/${item.id}`);
      advanceAfterAction();
    });
  };

  // Existing artwork → always ancillary, never touches that artwork's
  // main image (per 2026-08-05 decision — changing an existing artwork's
  // main image is a separate action, done from the Artwork editor).
  const handleAddToExistingArtwork = (item: HopperItem, artworkId: string, artworkTitle: string) => {
    startTransition(async () => {
      await addHopperItemToArtwork(item.id, siteId, artworkId, false);
      logProcessed(item, `Linked to ${artworkTitle}`, `/sites/${siteId}/artworks/${artworkId}`);
      advanceAfterAction();
    });
  };

  // New artwork → always becomes its main image, since it's the only
  // image the artwork has at the point of creation.
  const handleAddNewArtwork = (item: HopperItem, title: string) => {
    startTransition(async () => {
      const finalTitle = title.trim() || "Untitled";
      const result = await quickCreateArtwork(artistId, finalTitle);
      if ("error" in result || !result.artwork) {
        setAddError(result.error || "Couldn't create the artwork. Try again.");
        return;
      }
      await addHopperItemToArtwork(item.id, siteId, result.artwork.id, true);
      logProcessed(item, `New artwork: ${finalTitle}`, `/sites/${siteId}/artworks/${result.artwork.id}`);
      advanceAfterAction();
    });
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAddError(null);
    setAddUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Folder picks can include non-media files (.DS_Store, etc.) —
        // silently skip anything that isn't an image or video rather
        // than erroring the whole batch out.
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
        await uploadFileDirect(file, artistId, "HOPPER", "Manual upload");
      }
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setAddUploading(false);
    }
  };

  return (
    <div className="px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Hopper <span className="text-base font-normal text-neutral-400">({queue.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Check Incoming
          </button>
          <label
            className={`rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 ${
              addUploading ? "cursor-wait opacity-50" : "cursor-pointer"
            }`}
          >
            Add from folder
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={addUploading}
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
          </label>
          <label
            className={`rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 ${
              addUploading ? "cursor-wait opacity-50" : "cursor-pointer"
            }`}
          >
            Add media
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={addUploading}
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      {addError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{addError}</p>
      )}

      <div
        className="grid items-start gap-6"
        style={{ gridTemplateColumns: current ? "300px 1fr 280px" : "300px 1fr" }}
      >
        {/* Processed — a visual confirmation trail, not part of the
            sorting flow itself, so it stays put even once the queue on
            the right runs out. */}
        <div className="sticky top-4">
          {processedLog.length > 0 && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Processed
                </p>
                <button
                  type="button"
                  onClick={() => setProcessedLog([])}
                  className="text-xs text-neutral-400 hover:text-neutral-700 hover:underline"
                >
                  Clear list
                </button>
              </div>
              <div className="space-y-2">
                {processedLog.map((entry) => {
                  const thumb = entry.thumbUrl ? (
                    <img
                      src={entry.thumbUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-200 text-[9px] text-neutral-500">
                      Video
                    </div>
                  );
                  const text = (
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-700">✓ {entry.label}</p>
                      <p className="text-xs text-neutral-400">
                        {entry.kind === "VIDEO" ? "Video" : "Photo"}
                      </p>
                    </div>
                  );
                  return entry.href ? (
                    <Link
                      key={entry.key}
                      href={entry.href}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 p-2 hover:border-neutral-300 hover:bg-neutral-50"
                    >
                      {thumb}
                      {text}
                    </Link>
                  ) : (
                    <div
                      key={entry.key}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 p-2"
                    >
                      {thumb}
                      {text}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!current ? (
          <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
            Hopper is empty — nothing waiting to be sorted.
          </div>
        ) : (
          <SortingCard
            key={current.id}
            siteId={siteId}
            artistId={artistId}
            item={current}
            tagPresets={tagPresets}
            isPending={isPending}
            onBin={() => handleBin(current)}
            onAddToMedia={() => handleAddToMedia(current)}
            onAddToExistingArtwork={(artworkId, artworkTitle) =>
              handleAddToExistingArtwork(current, artworkId, artworkTitle)
            }
            onAddNewArtwork={(title) => handleAddNewArtwork(current, title)}
          />
        )}

        {current && (
          <div className="sticky top-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Up next ({remaining.length})
            </p>
            {remaining.length === 0 ? (
              <p className="text-xs text-neutral-400">This is the last one.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {remaining.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="overflow-hidden rounded-md border-2 border-transparent hover:border-neutral-300"
                  >
                    {item.kind === "VIDEO" ? (
                      item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-neutral-200 text-[10px] text-neutral-500">
                          Video
                        </div>
                      )
                    ) : (
                      <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortingCard({
  siteId,
  artistId,
  item,
  tagPresets,
  isPending,
  onBin,
  onAddToMedia,
  onAddToExistingArtwork,
  onAddNewArtwork,
}: {
  siteId: string;
  artistId: string;
  item: HopperItem;
  tagPresets: string[];
  isPending: boolean;
  onBin: () => void;
  onAddToMedia: () => void;
  onAddToExistingArtwork: (artworkId: string, artworkTitle: string) => void;
  onAddNewArtwork: (title: string) => void;
}) {
  // Local state, reset automatically each time this card remounts (the
  // parent keys it by item.id) — no stale-caption bug when moving
  // between queue items.
  const [caption, setCaption] = useState(item.caption || "");
  const [altText, setAltText] = useState(item.altText || "");
  const [tags, setTags] = useState<string[]>(item.tags);

  const saveFields = (nextTags?: string[]) => {
    const fd = new FormData();
    fd.set("caption", caption);
    fd.set("altText", altText);
    fd.set("tags", (nextTags ?? tags).join(", "));
    // Fire-and-forget — this is a background autosave, not the action
    // that advances the queue, so it doesn't need its own pending state.
    updateHopperCaption(item.id, siteId, fd);
  };

  // Tags are click-to-toggle from the artist's preset list (Media
  // Catalogue → Settings), not typed — per 2026-08-05 decision, so tags
  // stay consistent/searchable rather than drifting into one-off typos.
  // Saves immediately on click, since there's no "blur" moment the way
  // there is for a text field.
  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    saveFields(next);
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <p className="mb-3 text-xs text-neutral-400">
        Received {new Date(item.createdAt).toLocaleString()}
      </p>

      {item.kind === "VIDEO" ? (
        <video
          src={item.url}
          poster={item.posterUrl || undefined}
          controls
          className="mb-4 max-h-[480px] w-full rounded-md bg-neutral-50 object-contain"
        />
      ) : (
        <img
          src={item.url}
          alt=""
          className="mb-4 max-h-[480px] w-full rounded-md bg-neutral-50 object-contain"
        />
      )}

      <div className="mb-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Caption</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => saveFields()}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Alt text</label>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            onBlur={() => saveFields()}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Tags</label>
          {tagPresets.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No tags set up yet — add some under Media Catalogue → Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagPresets.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Four plain, equal-weight buttons — not the dashed "+ Add" tile.
          This screen assigns/routes an existing item rather than adding
          new media, so the tile's "click to add something new" implication
          would be misleading here. See decisions-log, 2026-08-05. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={onBin}
          disabled={isPending}
          className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Bin
        </button>
        <button
          type="button"
          onClick={onAddToMedia}
          disabled={isPending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Add to Media
        </button>
        <ArtworkPicker
          artistId={artistId}
          mode="single"
          variant="button"
          label="Add to Existing Artwork"
          onSelect={(artworks) => {
            if (artworks[0]) {
              onAddToExistingArtwork(artworks[0].id, artworks[0].presentationTitle);
            }
          }}
        />
        <button
          type="button"
          onClick={() => onAddNewArtwork(caption)}
          disabled={isPending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Add New Artwork
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        &quot;Add New Artwork&quot; uses the caption above as its title (or &quot;Untitled&quot; if
        blank), and this image becomes its main image automatically.
      </p>
    </div>
  );
}
