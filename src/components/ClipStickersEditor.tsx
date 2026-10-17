"use client";

import { randomId } from "@/lib/randomId";
import VideoThumb from "@/components/VideoThumb";
import { CHECKERED_STYLE } from "@/components/StickerLibraryView";
import { videoSize, type VideoShape } from "@/lib/videoTimeline";
import {
  STICKER_POSITIONS,
  STICKER_SIZE_DEFAULT,
  STICKER_SIZE_MAX,
  STICKER_SIZE_MIN,
  stickerPreviewStyle,
  type ClipSticker,
  type StickerPosition,
  type StickerRow,
} from "@/lib/stickers";

// A Video Edit clip's picture stickers (2026-10-16): a preview of the clip
// at the video's shape with its stickers on it, the artist's stickers to
// add, and for each placed sticker one of nine spots and a size. Shown
// for the whole of the clip.

const MAX_STICKERS = 5;

const POSITION_LABEL: Record<StickerPosition, string> = {
  topLeft: "Top left",
  top: "Top",
  topRight: "Top right",
  left: "Left",
  center: "Centre",
  right: "Right",
  bottomLeft: "Bottom left",
  bottom: "Bottom",
  bottomRight: "Bottom right",
};

export default function ClipStickersEditor({
  siteId,
  frame,
  shape,
  library,
  stickers,
  onChange,
}: {
  siteId: string;
  // The clip's picture: a photo, or a video's poster or first frame.
  frame: { url: string; posterUrl: string | null; kind: "PHOTO" | "VIDEO" };
  shape: VideoShape;
  library: StickerRow[];
  stickers: ClipSticker[];
  onChange: (stickers: ClipSticker[]) => void;
}) {
  const size = videoSize(shape);
  const byId = new Map(library.map((s) => [s.id, s]));
  const placed = stickers.filter((s) => byId.has(s.stickerId));

  const update = (id: string, patch: Partial<ClipSticker>) =>
    onChange(placed.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = (stickerId: string) =>
    onChange([...placed, { id: randomId(), stickerId, position: "bottomRight", size: STICKER_SIZE_DEFAULT }]);

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-medium text-neutral-700">Stickers</h3>
      <div className="flex flex-wrap gap-6">
        <div className="relative w-56 overflow-hidden rounded-md bg-black" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          {frame.kind === "VIDEO" && !frame.posterUrl ? (
            <VideoThumb src={frame.url} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame.posterUrl ?? frame.url} alt="" className="h-full w-full object-cover" />
          )}
          {placed.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.id} src={byId.get(s.stickerId)!.url} alt="" style={stickerPreviewStyle(s.position, s.size)} />
          ))}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {placed.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 p-2">
              <div className="flex h-12 w-12 items-center justify-center rounded" style={CHECKERED_STYLE}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={byId.get(s.stickerId)!.url} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="grid grid-cols-3 gap-0.5" title="Where it sits">
                {STICKER_POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => update(s.id, { position: p })}
                    aria-label={POSITION_LABEL[p]}
                    title={POSITION_LABEL[p]}
                    className={`h-4 w-4 rounded-sm border ${
                      s.position === p ? "border-neutral-900 bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100"
                    }`}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                Size
                <input
                  type="range"
                  min={STICKER_SIZE_MIN}
                  max={STICKER_SIZE_MAX}
                  step={0.01}
                  value={s.size}
                  onChange={(e) => update(s.id, { size: Number(e.target.value) })}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(placed.filter((x) => x.id !== s.id))}
                className="text-xs text-neutral-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}

          {library.length === 0 ? (
            <a href={`/sites/${siteId}/media?purpose=stickers`} className="text-xs text-neutral-400 underline">
              Add stickers in the Media Catalogue
            </a>
          ) : placed.length < MAX_STICKERS ? (
            <div>
              <p className="mb-1 text-xs text-neutral-500">Add a sticker:</p>
              <div className="flex flex-wrap gap-2">
                {library.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    onClick={() => add(sticker.id)}
                    title={sticker.name}
                    className="flex h-12 w-12 items-center justify-center rounded border border-neutral-200 hover:border-neutral-900"
                    style={CHECKERED_STYLE}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sticker.url} alt={sticker.name} className="max-h-full max-w-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">At most {MAX_STICKERS} stickers on a clip.</p>
          )}
        </div>
      </div>
    </div>
  );
}
