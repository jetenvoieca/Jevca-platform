// Picture stickers (2026-10-16) — the Stickers library and stickers placed
// on Video Edit clips; shared by the pages and the server. Plain module.

export type StickerRow = {
  id: string;
  name: string;
  url: string;
};

// Where a sticker sits on its clip — one of nine spots (Shotstack's own
// position names).
export type StickerPosition =
  | "topLeft"
  | "top"
  | "topRight"
  | "left"
  | "center"
  | "right"
  | "bottomLeft"
  | "bottom"
  | "bottomRight";

// In the order they're shown, as a 3×3 grid.
export const STICKER_POSITIONS: StickerPosition[] = [
  "topLeft",
  "top",
  "topRight",
  "left",
  "center",
  "right",
  "bottomLeft",
  "bottom",
  "bottomRight",
];

// A sticker's width, as a share of the video's width.
export const STICKER_SIZE_MIN = 0.1;
export const STICKER_SIZE_MAX = 0.6;
export const STICKER_SIZE_DEFAULT = 0.25;

// The gap kept from the video's edge, as a share of its size.
export const STICKER_MARGIN = 0.04;

export type ClipSticker = {
  // This placing (one sticker can be on a clip more than once).
  id: string;
  stickerId: string;
  position: StickerPosition;
  size: number;
};

export function isStickerPosition(value: unknown): value is StickerPosition {
  return STICKER_POSITIONS.includes(value as StickerPosition);
}

// Where a sticker sits within its box, for the editor's preview: CSS
// left/top as percentages and the matching transform.
export function stickerPreviewStyle(position: StickerPosition, size: number): Record<string, string> {
  const m = `${STICKER_MARGIN * 100}%`;
  const col = position.endsWith("Left") || position === "left" ? 0 : position.endsWith("Right") || position === "right" ? 2 : 1;
  const row = position.startsWith("top") ? 0 : position.startsWith("bottom") ? 2 : 1;
  return {
    position: "absolute",
    width: `${size * 100}%`,
    ...(col === 0 ? { left: m } : col === 2 ? { right: m } : { left: "50%" }),
    ...(row === 0 ? { top: m } : row === 2 ? { bottom: m } : { top: "50%" }),
    transform: `translate(${col === 1 ? "-50%" : "0"}, ${row === 1 ? "-50%" : "0"})`,
  };
}
