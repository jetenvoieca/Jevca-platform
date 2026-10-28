"use client";

import { useRef, useState } from "react";
import MediaCatalogueTabs from "@/components/MediaCatalogueTabs";
import { putToR2 } from "@/lib/putToR2";
import { addSticker, deleteSticker, renameSticker, requestStickerUpload } from "@/lib/actions/stickers";
import type { StickerRow } from "@/lib/stickers";
import { seeThroughPicture } from "@/lib/seeThroughPicture";

// The Media Catalogue's Stickers view (2026-10-16): the artist's picture
// stickers for Video Edit — PNGs, usually with a see-through background
// (shown here on a checked background so that's visible). Upload several
// at once, rename, delete. Any picture the browser can open can be chosen
// (2026-10-17 — a PNG with an unusual file name couldn't be picked); it's
// made see-through and trimmed here first (lib/seeThroughPicture.ts).

// A checked background, to show see-through parts.
export const CHECKERED_STYLE = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
};

export default function StickerLibraryView({
  siteId,
  artistId,
  initialStickers,
}: {
  siteId: string;
  artistId: string;
  initialStickers: StickerRow[];
}) {
  const [stickers, setStickers] = useState(initialStickers);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const png = await seeThroughPicture(file);
        const name = file.name.replace(/\.[^.]+$/, "");
        const step = await requestStickerUpload(artistId, `${name}.png`, "image/png");
        if ("error" in step) throw new Error(step.error);
        await putToR2(step.uploadUrl, png, "image/png");
        const sticker = await addSticker(artistId, { key: step.key, name });
        if ("error" in sticker) throw new Error(sticker.error);
        setStickers((prev) => [...prev, sticker].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : "couldn't be uploaded."}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const rename = (id: string, name: string) => {
    if (!name.trim()) return;
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
    renameSticker(artistId, id, name);
  };

  const remove = async (sticker: StickerRow) => {
    if (!confirm(`Delete "${sticker.name}"?`)) return;
    setStickers((prev) => prev.filter((s) => s.id !== sticker.id));
    await deleteSticker(artistId, sticker.id);
  };

  return (
    <div className="px-6 py-4">
      <div className="sticky top-0 z-10 -mt-4 space-y-3 border-b border-neutral-200 bg-white pb-3 pt-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>
        <div className="flex flex-wrap items-center gap-3">
          <MediaCatalogueTabs siteId={siteId} current="stickers" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading != null}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {uploading ? `Uploading ${uploading}…` : "Upload stickers"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>

      <p className="mb-3 mt-3 text-sm text-neutral-400">
        Pictures, ideally PNGs with a see-through background, to place on clips in Video Edit.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {stickers.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No stickers yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {stickers.map((s) => (
            <div key={s.id}>
              <div
                className="flex aspect-square items-center justify-center rounded-md border border-neutral-200 p-2"
                style={CHECKERED_STYLE}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <input
                defaultValue={s.name}
                onBlur={(e) => e.target.value !== s.name && rename(s.id, e.target.value)}
                className="mt-1 w-full rounded border border-transparent px-1 py-0.5 text-sm hover:border-neutral-200 focus:border-neutral-300"
              />
              <button
                type="button"
                onClick={() => remove(s)}
                className="px-1 text-xs text-neutral-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
