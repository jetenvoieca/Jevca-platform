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
  createArtworkFromHopperQuick,
} from "@/lib/actions/hopper";
import { uploadFileDirect } from "@/lib/uploadDirect";
import ArtworkPicker from "@/components/ArtworkPicker";
import VideoThumb from "@/components/VideoThumb";
import HopperImportPanel from "@/components/HopperImportPanel";
import { type ArtworkSettings } from "@/components/ArtworkDetailPanel";

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
// Which end of the queue you're sorting from — a genuine processing-order
// choice (2026-08-18, direct request), not just how the "Up next" list
// looks: "newest" means the most recently uploaded item is the one you're
// actually asked to sort, and it sits at the top of "Up next" too.
// "oldest" is the original first-in-first-out order. Defaults to "newest"
// per direct instruction — remembered per artist, same localStorage
// pattern as the Processed log above.
const sortOrderKey = (artistId: string) => `jevca:hopper-sort-order:${artistId}`;
type HopperSortOrder = "newest" | "oldest";

export default function HopperView({
  siteId,
  artistId,
  queue,
  artworkSettings,
}: {
  siteId: string;
  artistId: string;
  queue: HopperItem[];
  // Used by the inline "quick catalogue" fields shown after "Add
  // Artwork" — see the note by that button in SortingCard.
  artworkSettings: ArtworkSettings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Defaults to "newest" (direct instruction) — the server always sends
  // `queue` oldest-first (see listHopperQueue's orderBy), so this is
  // resorted client-side below rather than requiring a fresh server
  // fetch just to flip direction; the whole queue is already loaded at
  // once anyway.
  const [sortOrder, setSortOrder] = useState<HopperSortOrder>("newest");
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
  // CSV import into the Hopper (2026-08-17) — a fourth way to populate
  // it, alongside the two file pickers, drag-and-drop, and the iPhone
  // Shortcut. See HopperImportPanel.tsx.
  const [showCsvImport, setShowCsvImport] = useState(false);

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

  // Same SSR-safe "start at the default, fill in from storage right
  // after mount" pattern as the Processed log above — starts at
  // "newest" on both server and first client render (no hydration
  // mismatch), then switches to whatever this browser last chose, if
  // anything, immediately after.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(sortOrderKey(artistId));
      if (stored === "newest" || stored === "oldest") setSortOrder(stored);
    } catch {
      // Corrupt or unavailable storage — just keep the "newest" default.
    }
  }, [artistId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sortOrderKey(artistId), sortOrder);
    } catch {
      // Storage full/unavailable — non-critical, just won't persist.
    }
  }, [sortOrder, artistId]);

  // The server always sends `queue` oldest-first (listHopperQueue's
  // orderBy) — sorted explicitly here by createdAt rather than just
  // reversing that array, so this doesn't quietly break if the server
  // order ever changes for an unrelated reason.
  const sortedQueue =
    sortOrder === "newest"
      ? [...queue].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : [...queue].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 2026-08-19 — separate from `current` itself: tracks whether the
  // person has actually gotten going yet (picked something, or completed
  // an action), so advanceAfterAction below can tell "just landed, stay
  // blank" apart from "mid-session, auto-advance to the next item" even
  // though both cases leave selectedId null.
  const [hasInteracted, setHasInteracted] = useState(false);

  // Blank until something is actually picked — either a thumbnail from
  // "Up next" below, or a freshly dropped/uploaded file — but once the
  // person has gotten going, falls back to the new oldest/newest item
  // same as always, so the flick-through rhythm after each action (see
  // advanceAfterAction) isn't broken by this. Matters more now that "Add
  // New" in the Artwork Catalogue sends people here directly (2026-08-19,
  // direct request): landing on an arbitrary existing item to sort, when
  // what you actually came here to do was add something new, was exactly
  // the wrong first impression.
  const current = selectedId
    ? sortedQueue.find((i) => i.id === selectedId) ?? null
    : hasInteracted
      ? sortedQueue[0] ?? null
      : null;
  const remaining = sortedQueue.filter((i) => i.id !== current?.id);

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
    setHasInteracted(true);
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

  // New artwork, single commit (2026-08-18, direct request — replaces a
  // two-step version that created the artwork the moment "Add Artwork"
  // was pressed, then saved each Catalogue field separately as it was
  // filled in afterwards). Nothing is written to the database until this
  // runs, fired once from SortingCard's "Done, next item" — the artwork
  // (with title + whatever Catalogue fields were filled in), the image
  // link, and setting it as the main image all happen together in
  // createArtworkFromHopperQuick. Only then does the queue auto-advance,
  // same rhythm as every other action on this screen.
  const handleAddNewArtwork = async (
    item: HopperItem,
    title: string,
    fields: FormData
  ): Promise<boolean> => {
    const result = await createArtworkFromHopperQuick(item.id, siteId, artistId, title, fields);
    if (!result.ok) {
      setAddError(result.error);
      return false;
    }
    setAddError(null);
    const finalTitle = title.trim() || "Untitled";
    logProcessed(item, `New artwork: ${finalTitle}`, `/sites/${siteId}/artworks?selected=${result.artwork.id}`);
    advanceAfterAction();
    return true;
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

  // Labels shortened 2026-08-17 (was "Check Incoming"/"Add from folder"/
  // "Add media") — direct request, part of tidying the layout up for use
  // at half-screen width where every extra pixel of button-row space
  // matters. No longer echoed as an invisible spacer above the other two
  // columns (removed 2026-08-18 — see the note below) — this row now only
  // exists here, above the sorting card, where it actually belongs.
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
      <button
        type="button"
        onClick={() => setShowCsvImport(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        CSV
      </button>
      {/* Hidden below lg — at half-screen width every extra pixel of
          this row matters more than the reminder does, and the drop
          overlay itself (see isDraggingOver above) already makes the
          capability obvious the moment you actually start dragging. */}
      <span className="hidden text-xs text-neutral-400 lg:inline">
        or drag and drop files anywhere here
      </span>
    </div>
  );

  // Alignment spacers (importButtonsSpacer, and the matching invisible
  // block in the centre column below) were removed 2026-08-18, direct
  // request — they kept "Processed"/"Up next"'s headers level with the
  // centre column's actual content, at the cost of a real, visible chunk
  // of dead space at the top of both side columns doing nothing but
  // holding a gap open. Traded away deliberately: the three columns'
  // headers no longer sit on an exact shared baseline, but "Processed"
  // and "Up next" now start right at the top of their own column,
  // reclaiming that space for more visible thumbnails.

  return (
    <div
      className="relative mx-auto min-h-full max-w-[1700px] px-6 py-4"
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

      {/* Responsive layout, reworked 2026-08-18 — replaces a
          position:sticky-based approach that didn't actually give
          independent scrolling (confirmed broken: scrolling the centre
          column moved the whole page, dragging "Processed" and its
          header along with it, rather than the side columns staying
          fixed in place). This now follows the same proven pattern
          already used elsewhere in this app (the Artwork editor's
          grid/detail split, MediaPicker's grid/panel split): a row with
          a genuinely fixed height at lg, three independent panes each
          scrolling only themselves via their own overflow-y-auto, each
          pane's header living outside that scrolling area entirely (not
          reliant on `sticky`, so there's no ancestor-scroll-context
          question to get wrong). Below lg: unchanged — a single stacked
          column with natural page scroll, sorting card first via the
          order-* classes (what matters when you've just dragged
          something in), Up next second, Processed last. */}
      <div className="flex flex-col gap-6 lg:h-[calc(100vh-7rem)] lg:flex-row lg:items-stretch">
        {/* Processed — a visual confirmation trail, not part of the
            sorting flow itself, so it stays put once the queue on the
            right runs out. */}
        <div className="order-3 flex flex-col lg:order-none lg:w-[300px] lg:flex-shrink-0 lg:overflow-hidden">
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
              <div className="space-y-2 lg:flex-1 lg:overflow-y-auto lg:pr-1">
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
                  const removeButton = (
                    <button
                      type="button"
                      onClick={(e) => {
                        // Stops the surrounding Link (when this row has
                        // one) from navigating — this button removing the
                        // row is the only thing a click on it should do.
                        e.preventDefault();
                        e.stopPropagation();
                        setProcessedLog((prev) => prev.filter((p) => p.key !== entry.key));
                      }}
                      aria-label={`Remove ${entry.label} from the processed list`}
                      className="shrink-0 rounded px-1.5 py-0.5 text-sm leading-none text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                      ×
                    </button>
                  );
                  return entry.href ? (
                    <Link
                      key={entry.key}
                      href={entry.href}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 p-2 hover:border-neutral-300 hover:bg-neutral-50"
                    >
                      {thumb}
                      {text}
                      {removeButton}
                    </Link>
                  ) : (
                    <div
                      key={entry.key}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 p-2"
                    >
                      {thumb}
                      {text}
                      {removeButton}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="order-1 flex flex-col lg:order-none lg:min-w-0 lg:flex-1 lg:overflow-hidden">
          <div className="mb-3">{importButtons}</div>
          <div className="lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {!current ? (
              <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
                {queue.length === 0
                  ? "Hopper is empty — drag and drop files here, or use the buttons above."
                  : "Drag and drop a new file in, or pick one from Up next to start sorting."}
              </div>
            ) : (
              <SortingCard
                key={current.id}
                siteId={siteId}
                artistId={artistId}
                item={current}
                isPending={isPending}
                settings={artworkSettings}
                onBin={() => handleBin(current)}
                onAddToMedia={() => handleAddToMedia(current)}
                onAddToBucket={() => handleAddToBucket(current)}
                onAddToExistingArtwork={(artworkId, artworkTitle) =>
                  handleAddToExistingArtwork(current, artworkId, artworkTitle)
                }
                onAddNewArtwork={(title, fields) => handleAddNewArtwork(current, title, fields)}
              />
            )}
          </div>
        </div>

        {/* Up next — always rendered (not just while there's a current
            item), so "Up next (0)" and this column's place in the layout
            stay visible and stable even once the queue empties out.
            Widened 300px → 700px and 6 → 7 columns (2026-08-18, direct
            request) — the previous fixed 380px left a large stretch of
            genuinely unused space on any wide screen (this page's own
            max-width was raised to match, see the outer container
            below), and gave meaningfully bigger thumbnails to sort by. */}
        <div className="order-2 flex flex-col lg:order-none lg:w-[700px] lg:flex-shrink-0 lg:overflow-hidden">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Up next ({remaining.length})
            </p>
            {/* Sort order (2026-08-18) — small ^/v arrows, replacing an
                earlier pill-button toggle per direct request ("neat
                little arrows instead [of] ugly buttons"). Up = newest
                first, down = oldest first; the active direction is
                solid black, the inactive one pale grey. Genuinely
                changes which item you're asked to sort next, not just
                how this list looks — see sortedQueue above. */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSortOrder("newest")}
                aria-label="Newest first"
                title="Newest first"
                className={`px-1 text-xs leading-none ${
                  sortOrder === "newest"
                    ? "text-neutral-900"
                    : "text-neutral-300 hover:text-neutral-500"
                }`}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setSortOrder("oldest")}
                aria-label="Oldest first"
                title="Oldest first"
                className={`px-1 text-xs leading-none ${
                  sortOrder === "oldest"
                    ? "text-neutral-900"
                    : "text-neutral-300 hover:text-neutral-500"
                }`}
              >
                ▼
              </button>
            </div>
          </div>
          <div className="lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {sortedQueue.length === 0 ? null : remaining.length === 0 ? (
              <p className="text-xs text-neutral-400">This is the last one.</p>
            ) : (
              <div className="grid grid-cols-6 gap-2 lg:grid-cols-7">
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

      {showCsvImport && (
        <HopperImportPanel
          artistId={artistId}
          siteId={siteId}
          onClose={() => setShowCsvImport(false)}
        />
      )}
    </div>
  );
}

function SortingCard({
  siteId,
  artistId,
  item,
  isPending,
  settings,
  onBin,
  onAddToMedia,
  onAddToBucket,
  onAddToExistingArtwork,
  onAddNewArtwork,
}: {
  siteId: string;
  artistId: string;
  item: HopperItem;
  isPending: boolean;
  settings: ArtworkSettings;
  onBin: () => void;
  onAddToMedia: () => void;
  onAddToBucket: () => void;
  onAddToExistingArtwork: (artworkId: string, artworkTitle: string) => void;
  // Fires once, from the quick-catalogue form's "Done, next item" — not
  // from "Add Artwork" any more (2026-08-18). Returns whether it
  // succeeded so this card knows whether to keep the form open (on
  // failure, so nothing typed is lost) or let the parent's advance take
  // over (on success).
  onAddNewArtwork: (title: string, fields: FormData) => Promise<boolean>;
}) {
  // Local state, reset automatically each time this card remounts (the
  // parent keys it by item.id) — no stale-caption bug when moving
  // between queue items.
  const [caption, setCaption] = useState(item.caption || "");
  // Whether the inline "quick catalogue" form is open. Nothing is created
  // in the database just by opening it (2026-08-18) — closing it again,
  // whether via Cancel or by picking a different action button entirely,
  // discards whatever was typed with no cleanup needed, since nothing was
  // ever saved.
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [creatingArtwork, setCreatingArtwork] = useState(false);


  const saveFields = () => {
    const fd = new FormData();
    fd.set("caption", caption);
    // Fire-and-forget — this is a background autosave, not the action
    // that advances the queue, so it doesn't need its own pending state.
    updateHopperCaption(item.id, siteId, fd);
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
        {/* Shortened from "Add New Artwork" (2026-08-17) specifically so
            it fits alongside "Add to Existing Artwork" on the same row.
            2026-08-18: no longer creates anything on this click — it only
            opens the form below. Nothing is saved to the database until
            "Done, next item" inside that form. */}
        <button
          type="button"
          onClick={() => setShowQuickForm(true)}
          disabled={isPending || showQuickForm}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Add Artwork
        </button>
      </div>
      {!showQuickForm && (
        <p className="mt-2 text-xs text-neutral-400">
          &quot;Add Artwork&quot; uses the caption above as its title (or &quot;Untitled&quot;
          if blank), and this image becomes its main image automatically.
        </p>
      )}

      {/* Inline "quick catalogue" fields (2026-08-18, reworked to a true
          one-shot flow per direct request). Opening this form no longer
          creates the artwork — it's a plain local form, nothing is saved
          anywhere until "Done, next item" is pressed. That single press
          creates the artwork, fills in whatever fields were completed
          (all optional), and links this image as its main image, all
          together. "Cancel" (or just picking a different action button
          instead) discards everything typed with nothing to clean up,
          since nothing was ever written to the database. */}
      {showQuickForm && (
        <QuickCatalogueFields
          settings={settings}
          creating={creatingArtwork}
          onCancel={() => setShowQuickForm(false)}
          onDone={async (fields) => {
            setCreatingArtwork(true);
            const ok = await onAddNewArtwork(caption, fields);
            setCreatingArtwork(false);
            // On failure, leave the form open (with whatever was typed
            // still in it, since it's a plain uncontrolled form) so
            // nothing is lost and the error banner above explains why —
            // same pattern as every other action on this screen.
            if (ok) setShowQuickForm(false);
          }}
        />
      )}
    </div>
  );
}

// Same field set as the full Artwork editor's Catalogue tab (see
// ArtworkDetailPanel.tsx) — deliberately not Name (comes from the
// caption above instead) or Edition/Available qty (kept out to match the
// simpler layout this was asked for; a brand-new artwork has nothing in
// either field yet regardless, so omitting them from this form doesn't
// lose anything).
//
// 2026-08-18: no longer autosaves field-by-field, since there's no
// artwork to save to until "Done, next item" is pressed — the artwork
// doesn't exist until then. This is now a plain uncontrolled form; every
// field's current value is only read once, from a single FormData
// snapshot taken at that moment.
function QuickCatalogueFields({
  settings,
  creating,
  onCancel,
  onDone,
}: {
  settings: ArtworkSettings;
  creating: boolean;
  onCancel: () => void;
  onDone: (fields: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="mt-4 rounded-md border border-neutral-300 p-4">
      <form ref={formRef} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Type</label>
            <select
              name="type"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Choose from list…</option>
              {settings.artworkTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Group</label>
            <select
              name="catalogueGroup"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Choose from list…</option>
              {settings.artworkGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Medium</label>
          <select
            name="medium"
            defaultValue=""
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Choose from list…</option>
            {settings.mediumPresets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Size</label>
            <select
              name="size"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Choose from list…</option>
              {settings.sizePresets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Location</label>
            <select
              name="location"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Choose from list…</option>
              {settings.artworkLocations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Year moved to sit alongside Availability rather than Name
            (2026-08-17, direct request — "moved year for better fit"),
            unlike the full editor's own layout where it's next to Name. */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Availability
            </label>
            <select
              name="availability"
              defaultValue="AVAILABLE"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Year</label>
            <input
              type="text"
              name="year"
              defaultValue=""
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Studio notes <span className="font-normal text-neutral-400">(private)</span>
          </label>
          <textarea
            name="studioNotes"
            defaultValue=""
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </form>
      {/* "Done, next item" (added 2026-08-17, since this form otherwise
          has no explicit way to conclude) is now also the button that
          actually creates the artwork (2026-08-18) — filling any/none of
          the fields above is still optional, but this is the one
          deliberate, single moment anything gets saved. "Cancel" is new
          alongside it: since nothing exists in the database until this
          click, backing out needs no cleanup at all — just closing the
          form. */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => formRef.current && onDone(new FormData(formRef.current))}
          disabled={creating}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Done, next item"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}




