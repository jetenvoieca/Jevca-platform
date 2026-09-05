// Single source of truth for how big an Image/Video/Gallery block's
// media box is, in every place a page's blocks get rendered — the
// editor (PageEditor.tsx, via MediaPicker), the editor's own live
// preview column (LiveBlockPreview.tsx), and the full /preview page
// (BlockRenderer.tsx). Before this file existed, each of those three
// had its own hand-written copy of this logic, and two rounds of
// regressions (2026-09-04, 2026-09-05) both came from those copies
// quietly drifting apart. Routing every caller through this one
// function makes that class of bug structurally impossible rather
// than something to remember to keep in sync.
//
// Design principle: a row's height, once set, is delivered as a real
// pixel number applied directly (inline style) to the media element —
// never as a percentage (e.g. `h-full`) inherited through nested
// flex/grid wrapper layers. A literal number can't be silently
// overridden by an ancestor's own content-based sizing the way a
// percentage can; that's what broke twice. Any future block type that
// needs to fill a resized row's height should use this same approach
// rather than a new percentage chain.
//
// Standalone (non-row) images/video are never cropped — decision
// 2026-09-05, direct request: this is an artist's portfolio, so an
// image should always show in full rather than being auto-cropped to
// fit a fixed box. They scale down to fit within a generous cap so an
// extremely tall image doesn't stretch the page unreasonably, but
// nothing of the image is ever clipped.

export type MediaSizeMode =
  // Not in a row, OR in a row that hasn't had its height dragged yet.
  // Both render the same way: full image, natural aspect ratio, capped
  // so nothing runs absurdly long.
  | { kind: "natural" }
  // In a row whose height HAS been set (by dragging the row's height
  // handle). Every block sharing that row gets this exact pixel height.
  | { kind: "row"; rowHeightPx: number };

// The cap for natural-mode media (standalone, or an unresized row) —
// generous enough that this only engages for unusually tall images,
// since the point of natural mode is "show the whole thing".
const NATURAL_MAX_HEIGHT_PX = 700;

// The floor for an empty "add image/video" slot with no content yet to
// derive a size from — without this, the empty state has nothing to
// give it height and collapses to a text-sized sliver (2026-09-05 bug).
const EMPTY_SLOT_MIN_HEIGHT_PX = 220;

export type MediaBoxProps = {
  previewFit: "box" | "natural";
  previewClassName: string;
  previewStyle: { height?: number; maxHeight?: number; minHeight?: number };
  previewObjectFit: "cover" | "contain";
};

/**
 * For MediaPicker (editor) callers.
 * @param mode Which sizing regime applies — see MediaSizeMode above.
 * @param hasContent Whether this slot already has a picked image/video.
 *   Only affects `natural` mode: a filled slot sizes from its own
 *   intrinsic aspect ratio (max-width/height:auto + a max-height cap,
 *   applied directly to the image/video so it can never be cropped); an
 *   empty one needs an explicit min-height floor since it has no
 *   intrinsic size to derive one from. Row mode is unaffected by this —
 *   an explicit pixel height applies whether or not the slot is filled
 *   yet, which is what makes it immune to the empty-slot collapse in
 *   the first place.
 */
export function getMediaBoxProps(mode: MediaSizeMode, hasContent: boolean): MediaBoxProps {
  if (mode.kind === "row") {
    return {
      previewFit: "box",
      previewClassName: "h-full w-full",
      previewStyle: { height: mode.rowHeightPx },
      previewObjectFit: "contain",
    };
  }

  if (hasContent) {
    return {
      previewFit: "natural",
      previewClassName: "max-w-full h-auto rounded-md",
      previewStyle: { maxHeight: NATURAL_MAX_HEIGHT_PX },
      previewObjectFit: "contain", // unused by "natural" fit; kept for type symmetry
    };
  }

  return {
    previewFit: "natural",
    previewClassName: "",
    previewStyle: { minHeight: EMPTY_SLOT_MIN_HEIGHT_PX },
    previewObjectFit: "contain", // unused by "natural" fit; kept for type symmetry
  };
}

// The equivalent sizing for plain <img>/<video> elements — used by
// LiveBlockPreview.tsx and BlockRenderer.tsx, which render display-only
// media (no MediaPicker, no click-to-change) but must size it by the
// exact same rule so the editor and the real page can never disagree.
export type PlainMediaSizing = {
  className: string;
  style: { height?: number; maxHeight?: number };
};

export function getPlainMediaSizing(mode: MediaSizeMode): PlainMediaSizing {
  if (mode.kind === "row") {
    return {
      className: "h-full w-full rounded-md object-contain object-left-top",
      style: { height: mode.rowHeightPx },
    };
  }
  return {
    className: "max-w-full h-auto rounded-md",
    style: { maxHeight: NATURAL_MAX_HEIGHT_PX },
  };
}
