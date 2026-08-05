"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  binHopperItem,
  addHopperItemToMedia,
  addHopperItemToArtwork,
  updateHopperCaption,
} from "@/lib/actions/hopper";
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

export default function HopperView({
  siteId,
  artistId,
  queue,
}: {
  siteId: string;
  artistId: string;
  queue: HopperItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setAsMain, setSetAsMain] = useState(false);
  const [addUploading, setAddUploading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
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

  const current = queue.find((i) => i.id === selectedId) ?? queue[0] ?? null;
  const remaining = queue.filter((i) => i.id !== current?.id);

  // After any sort action, drop back to "no explicit selection" so the
  // next render (post-refresh, with this item now gone from the queue)
  // naturally falls forward to the new oldest item — the auto-advance
  // flick-through rhythm from the original spec, without needing to
  // track index positions by hand.
  const advanceAfterAction = () => {
    setSelectedId(null);
    setSetAsMain(false);
    router.refresh();
  };

  const handleBin = (id: string) => {
    startTransition(async () => {
      await binHopperItem(id, siteId);
      advanceAfterAction();
    });
  };

  const handleAddToMedia = (id: string) => {
    startTransition(async () => {
      await addHopperItemToMedia(id, siteId);
      advanceAfterAction();
    });
  };

  const handleAddToArtwork = (id: string, artworkId: string) => {
    startTransition(async () => {
      await addHopperItemToArtwork(id, siteId, artworkId, setAsMain);
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

      {!current ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
          Hopper is empty — nothing waiting to be sorted.
        </div>
      ) : (
        <div className="grid items-start gap-6" style={{ gridTemplateColumns: "1fr 280px" }}>
          <SortingCard
            key={current.id}
            siteId={siteId}
            artistId={artistId}
            item={current}
            isPending={isPending}
            setAsMain={setAsMain}
            onSetAsMainChange={setSetAsMain}
            onBin={() => handleBin(current.id)}
            onAddToMedia={() => handleAddToMedia(current.id)}
            onAddToArtwork={(artworkId) => handleAddToArtwork(current.id, artworkId)}
          />

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
        </div>
      )}
    </div>
  );
}

function SortingCard({
  siteId,
  artistId,
  item,
  isPending,
  setAsMain,
  onSetAsMainChange,
  onBin,
  onAddToMedia,
  onAddToArtwork,
}: {
  siteId: string;
  artistId: string;
  item: HopperItem;
  isPending: boolean;
  setAsMain: boolean;
  onSetAsMainChange: (v: boolean) => void;
  onBin: () => void;
  onAddToMedia: () => void;
  onAddToArtwork: (artworkId: string) => void;
}) {
  // Local state, reset automatically each time this card remounts (the
  // parent keys it by item.id) — no stale-caption bug when moving
  // between queue items.
  const [caption, setCaption] = useState(item.caption || "");
  const [altText, setAltText] = useState(item.altText || "");
  const [tags, setTags] = useState(item.tags.join(", "));

  const saveFields = () => {
    const fd = new FormData();
    fd.set("caption", caption);
    fd.set("altText", altText);
    fd.set("tags", tags);
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
          className="mb-4 w-full rounded-md"
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
            onBlur={saveFields}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Alt text</label>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            onBlur={saveFields}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Tags <span className="font-normal text-neutral-400">(comma separated)</span>
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={saveFields}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-neutral-200 pt-4">
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
          + Add to Media
        </button>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={setAsMain}
              onChange={(e) => onSetAsMainChange(e.target.checked)}
            />
            Set as main image
          </label>
          {/* Same dashed-tile trigger as everywhere else an artwork can be
              picked — see decisions-log.md, 2026-07-31 (universal "add"
              pattern). Wrapped narrower here since this is an actions row,
              not a grid, but the component itself is unchanged. */}
          <div className="w-32">
            <ArtworkPicker
              artistId={artistId}
              mode="single"
              label="Add to Artwork"
              onSelect={(artworks) => {
                if (artworks[0]) onAddToArtwork(artworks[0].id);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
