"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  binHopperItem,
  addHopperItemToMedia,
  addHopperItemToArtwork,
  addHopperItemToBucket,
  updateHopperCaption,
} from "@/lib/actions/hopper";
import { quickCreateArtwork } from "@/lib/actions/media";
import { uploadFileDirect } from "@/lib/uploadDirect";
import ArtworkPicker from "@/components/ArtworkPicker";
import VideoThumb from "@/components/VideoThumb";

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
  url: string;
  posterUrl: string | null;
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
  // { done, total } while a batch upload is in progress, null otherwise
  // — added 2026-08-17 so uploading a folder actually shows something
  // happening instead of the buttons just going quiet for a while.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [processedLog, setProcessedLog] = useState<ProcessedEntry[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Drag-and-drop, added 2026-08-17 as another way to populate the
  // Hopper alongside the two existing file pickers and the iPhone
  // Shortcut. dragCounterRef (not state) tracks nested enter/leave depth
  // — dragenter/dragleave fire repeatedly as the pointer crosses any
  // child element's boundary while dragging over the page, which without
  // this would flicker the overlay on and off constantly rather than
  // showing it steadily for the whole drag.
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

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
        url: item.url,
        posterUrl: item.posterUrl,
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
      logProcessed(item, "Added to Media Catalogue", `/sites/${siteId}/media?selected=${item.id}`);
      advanceAfterAction();
    });
  };

  const handleAddToBucket = (item: HopperItem) => {
    startTransition(async () => {
      const result = await addHopperItemToBucket(item.id, siteId);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setAddError(null);
      logProcessed(item, "Added to Bucket", `/sites/${siteId}/bucket`);
      advanceAfterAction();
    });
  };

  // Existing artwork → always ancillary, never touches that artwork's
  // main image (per 2026-08-05 decision — changing an existing artwork's
  // main image is a separate action, done from the Artwork editor).
  const handleAddToExistingArtwork = (item: HopperItem, artworkId: string, artworkTitle: string) => {
    startTransition(async () => {
      await addHopperItemToArtwork(item.id, siteId, artworkId, false);
      logProcessed(item, `Linked to ${artworkTitle}`, `/sites/${siteId}/artworks?selected=${artworkId}`);
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
      logProcessed(item, `New artwork: ${finalTitle}`, `/sites/${siteId}/artworks?selected=${result.artwork.id}`);
      advanceAfterAction();
    });
  };

  // How many files upload at once. Each file is already 2-4 sequential
  // network round trips on its own (get a presigned URL, PUT to R2,
  // finalize — plus a second get-URL/PUT for a video's poster frame) —
  // running them fully one-at-a-time, as this used to, meant a batch of
  // N files took roughly N times one file's full round-trip time with no
  // overlap at all. 4 is deliberately conservative: high enough to
  // materially cut wall-clock time for a folder of files, not so high it
  // risks hammering R2 or the presigned-URL endpoint if someone drops in
  // a genuinely huge folder (2026-08-17).
  const UPLOAD_CONCURRENCY = 4;

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Folder picks can include non-media files (.DS_Store, etc.) —
    // silently skip anything that isn't an image or video rather than
    // erroring the whole batch out. Filtered up front now (rather than
    // skipped one-by-one inside the loop) so the progress count/total
    // below only ever reflects files that actually attempt to upload.
    const mediaFiles = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (mediaFiles.length === 0) return;

    setAddError(null);
    setAddUploading(true);
    setUploadProgress({ done: 0, total: mediaFiles.length });

    try {
      // A small worker pool pulling from a shared index, rather than
      // Promise.all(mediaFiles.map(...)) directly — that would fire
      // every upload at once with no cap at all for a large folder.
      // Each worker handles its own files strictly one after another;
      // several workers run at the same time. Plain closure variables
      // (not state) for the counters — safe here because JS only
      // actually switches between these workers at an `await`, never
      // mid-statement, so incrementing `nextIndex`/`completed` never
      // races.
      let nextIndex = 0;
      let completed = 0;
      let failedCount = 0;

      const runWorker = async () => {
        while (true) {
          const i = nextIndex;
          nextIndex += 1;
          if (i >= mediaFiles.length) return;
          try {
            await uploadFileDirect(mediaFiles[i], artistId, "HOPPER", "Manual upload");
          } catch {
            // One bad file (corrupt, a network blip) used to abort the
            // whole remaining batch — now it's just counted as a
            // failure and every other file still gets its turn.
            failedCount += 1;
          } finally {
            completed += 1;
            setUploadProgress({ done: completed, total: mediaFiles.length });
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, mediaFiles.length) }, runWorker)
      );

      if (failedCount > 0) {
        setAddError(
          `${failedCount} of ${mediaFiles.length} file${mediaFiles.length === 1 ? "" : "s"} failed to upload — the rest were added.`
        );
      }
    } catch (err) {
      // Shouldn't happen (every real per-file failure is caught inside
      // runWorker above) — kept as a fallback net rather than leaving
      // this uncaught if something truly unexpected goes wrong.
      setAddError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploadProgress(null);
      setAddUploading(false);
      router.refresh();
    }
  };

  // Scoped to this page's own container, not the whole window — dragging
  // a file in only shows the overlay while it's over the Hopper itself,
  // not while it's still over the nav column or another screen entirely.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    // Only react to an actual file being dragged (e.g. from Finder/
    // Explorer or another browser tab) — not text, links, or a drag
    // gesture from something else on the page that isn't a file.
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    // Required for onDrop to ever fire at all — the browser's default
    // for dragover is to refuse the drop.
    e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    if (addUploading) return;
    handleUploadFiles(e.dataTransfer.files);
  };

  // Rendered for real above "Up next" (where these buttons conceptually
  // belong — they're what feeds that queue), and as an inert visual
  // spacer above the other two columns so all three still start their
  // actual content at the same height. The spacer is deliberately plain
  // <span>s, not a second copy of the real buttons/inputs — reusing the
  // interactive version (with its ref and handlers) in three places at
  // once would fight over which DOM node the ref actually points to.
  //
  // Labels shortened 2026-08-17 (was "Check Incoming"/"Add from folder"/
  // "Add media") — direct request, part of tidying the layout up for use
  // at half-screen width where every extra pixel of button-row space
  // matters.
  const importButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => router.refresh()}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        Incoming
      </button>
      <label
        className={`rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 ${
          addUploading ? "cursor-wait opacity-50" : "cursor-pointer"
        }`}
      >
        Folder
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
        File
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          disabled={addUploading}
          onChange={(e) => handleUploadFiles(e.target.files)}
        />
      </label>
      {/* Hidden below lg — at half-screen width every extra pixel of
          this row matters more than the reminder does, and the drop
          overlay itself (see isDraggingOver above) already makes the
          capability obvious the moment you actually start dragging. */}
      <span className="hidden text-xs text-neutral-400 lg:inline">
        or drag and drop files anywhere here
      </span>
    </div>
  );

  const importButtonsSpacer = (
    <div className="invisible flex flex-wrap items-center gap-2" aria-hidden="true">
      <span className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">Spacer</span>
      <span className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">Spacer</span>
      <span className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">Spacer</span>
    </div>
  );

  return (
    <div
      className="relative mx-auto min-h-full max-w-6xl px-6 py-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-4 border-dashed border-neutral-900 bg-white/90">
          <p className="text-lg font-medium text-neutral-900">
            Drop images or videos to add to the Hopper
          </p>
        </div>
      )}

      <h1 className="mb-3 text-2xl font-semibold text-neutral-900">
        Hopper <span className="text-base font-normal text-neutral-400">({queue.length})</span>
      </h1>

      {addError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{addError}</p>
      )}

      {uploadProgress && (
        <div className="mb-3 max-w-sm">
          <p className="mb-1 text-xs text-neutral-500">
            Uploading… {uploadProgress.done} of {uploadProgress.total}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full bg-neutral-900 transition-all"
              style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Responsive layout, reworked 2026-08-17 for usability at
          half-screen width (a real workflow here — this browser window
          docked to half the screen, Finder/Photos or another tab open
          on the other half, dragging files across). Below lg: a single
          stacked column, main sorting card first via the order-*
          classes below (that's what actually matters when you've just
          dragged something in), Up next second, Processed last. At lg
          and above: unchanged from before, the original fixed
          300px / 1fr / 280px three-column layout. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_1fr_280px]">
        {/* Processed — a visual confirmation trail, not part of the
            sorting flow itself, so it stays put even once the queue on
            the right runs out. Sticky only at lg — stacked full-width
            below that, sticky positioning on a block sitting inline in
            a single column would just glue it oddly to the top while
            scrolling past the other two, rather than the side-column
            behaviour it's meant for. */}
        <div className="order-3 lg:sticky lg:top-4 lg:order-none">
          <div className="mb-3 hidden lg:block">{importButtonsSpacer}</div>
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
                  const thumb =
                    entry.kind === "VIDEO" ? (
                      entry.posterUrl ? (
                        <img
                          src={entry.posterUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <VideoThumb
                          src={entry.url}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      )
                    ) : (
                      <img
                        src={entry.url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
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

        <div className="order-1 lg:order-none">
          <div className="mb-3">{importButtons}</div>
          {/* Invisible, but occupies exactly the same height as the
              "Processed"/"Up next" header rows either side of it — so
              the content below it (this empty-state box, or the
              SortingCard) lines up with the top of the first Processed
              *item* and the thumbnail grid, not with the labels above
              them. Only relevant once those columns sit beside this one
              at lg — hidden below that, where it would just be a blank
              gap above this, the first section on the stacked page. */}
          <div className="mb-2 hidden items-center justify-between lg:flex">
            <p className="invisible text-xs font-medium uppercase tracking-wide">Spacer</p>
            <span className="invisible text-xs">Spacer</span>
          </div>

          {!current ? (
            <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
              Hopper is empty — drag and drop files here, or use the buttons above.
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
              onAddToBucket={() => handleAddToBucket(current)}
              onAddToExistingArtwork={(artworkId, artworkTitle) =>
                handleAddToExistingArtwork(current, artworkId, artworkTitle)
              }
              onAddNewArtwork={(title) => handleAddNewArtwork(current, title)}
            />
          )}
        </div>

        {/* Up next — always rendered (not just while there's a current
            item), so "Up next (0)" and this column's place in the layout
            stay visible and stable even once the queue empties out. */}
        <div className="order-2 lg:sticky lg:top-4 lg:order-none">
          <div className="mb-3 hidden lg:block">{importButtonsSpacer}</div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Up next ({remaining.length})
          </p>
          {!current ? null : remaining.length === 0 ? (
            <p className="text-xs text-neutral-400">This is the last one.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-3">
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
                      <VideoThumb src={item.url} className="aspect-square w-full object-cover" />
                    )
                  ) : (
                    <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
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
  onAddToBucket,
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
  onAddToBucket: () => void;
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
        <button
          type="button"
          onClick={onAddToBucket}
          disabled={isPending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Add to Bucket
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
