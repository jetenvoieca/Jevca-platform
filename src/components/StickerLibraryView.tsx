"use client";

import { useRef, useState } from "react";
import MediaCatalogueTabs from "@/components/MediaCatalogueTabs";
import { putToR2 } from "@/lib/putToR2";
import { addSticker, deleteSticker, renameSticker, requestStickerUpload } from "@/lib/actions/stickers";
import type { StickerRow } from "@/lib/stickers";

// The Media Catalogue's Stickers view (2026-10-16): the artist's picture
// stickers for Video Edit — PNGs, usually with a see-through background
// (shown here on a checked background so that's visible). Upload several
// at once, rename, delete. Any picture the browser can open can be chosen
// (2026-10-17 — a PNG with an unusual file name couldn't be picked); it's
// made a PNG and trimmed of see-through edges here first (asSticker).

// A checked background, to show see-through parts.
export const CHECKERED_STYLE = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
};

// The picture ready to be a sticker: a PNG — its white background made
// see-through if it had no see-through parts (removeWhiteBackground) —
// with its see-through edges trimmed off (2026-10-17), so a signature on
// a big empty canvas becomes just the signature. A PNG with nothing to trim goes up as it is;
// anything else is drawn onto a canvas and saved as a PNG (see-through
// parts kept).
const SEE_THROUGH = 8; // alpha at or below this counts as empty

// Makes a picture's white background see-through (2026-10-17): every
// near-white pixel — including the white inside letters, which on a
// signature is background too — and the soft edge of the drawing blended
// to see-through, so no white fringe shows on a dark video. Only for
// pictures with no see-through parts of their own. False if there was no
// white to take out.
const NEAR_WHITE = 235;

function removeWhiteBackground(data: Uint8ClampedArray, width: number, height: number): boolean {
  const background = new Uint8Array(width * height);
  let found = false;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (data[i] >= NEAR_WHITE && data[i + 1] >= NEAR_WHITE && data[i + 2] >= NEAR_WHITE) {
      background[p] = 1;
      found = true;
    }
  }
  if (!found) return false;
  for (let p = 0; p < width * height; p++) {
    if (background[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    // The edge of the drawing: white taken out of its colour.
    const x = p % width;
    const touchesBackground =
      (x > 0 && background[p - 1]) ||
      (x < width - 1 && background[p + 1]) ||
      (p >= width && background[p - width]) ||
      (p < width * (height - 1) && background[p + width]);
    if (!touchesBackground) continue;
    const i = p * 4;
    const alpha = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]) / 255;
    if (alpha <= 0) {
      data[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 - (255 - data[i + c]) / alpha);
    data[i + 3] = Math.round(alpha * 255);
  }
  return true;
}

async function asSticker(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("this browser can't open that picture — save it as a PNG and try again.");
    });
    // A drawing with no size of its own (some SVGs) is made 1000px wide.
    const width = image.naturalWidth || 1000;
    const height = image.naturalHeight || 1000;
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const context = full.getContext("2d");
    if (!context) throw new Error("couldn't be read.");
    context.drawImage(image, 0, 0, width, height);

    // A picture with no see-through parts at all (e.g. a signature saved
    // on white) has its white background made see-through.
    const pixels = context.getImageData(0, 0, width, height);
    const { data } = pixels;
    let opaque = true;
    for (let i = 3; i < data.length && opaque; i += 4) if (data[i] < 255) opaque = false;
    const madeSeeThrough = opaque && removeWhiteBackground(data, width, height);
    if (madeSeeThrough) context.putImageData(pixels, 0, 0);

    // The smallest box holding everything that isn't see-through.
    let top = height,
      left = width,
      bottom = -1,
      right = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > SEE_THROUGH) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (bottom < 0) throw new Error("the picture is completely see-through.");
    const untrimmed = top === 0 && left === 0 && bottom === height - 1 && right === width - 1;
    const isPng = file.type === "image/png" || (!file.type && /\.png$/i.test(file.name));
    if (untrimmed && isPng && !madeSeeThrough) return file;

    const trimmed = document.createElement("canvas");
    trimmed.width = right - left + 1;
    trimmed.height = bottom - top + 1;
    trimmed
      .getContext("2d")
      ?.drawImage(full, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return await new Promise<Blob>((resolve, reject) =>
      trimmed.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("couldn't be made into a PNG."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function StickerLibraryView({
  siteId,
  artistId,
  initialStickers,
  relatedCount,
}: {
  siteId: string;
  artistId: string;
  initialStickers: StickerRow[];
  relatedCount: number;
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
        const png = await asSticker(file);
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
          <MediaCatalogueTabs siteId={siteId} current="stickers" relatedCount={relatedCount} />
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
