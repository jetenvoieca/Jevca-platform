// Single source of truth for how big an Image/Video/Gallery block's
// media box is, in every place a page's blocks get rendered — the
// editor (PageEditor.tsx, via MediaPicker), the editor's own live
// preview column (LiveBlockPreview.tsx), and the full /preview page
// (BlockRenderer.tsx). Before this file existed, each of those three
// had its own hand-written copy of this logic, and rounds of
// regressions (2026-09-04, 2026-09-05) all came from those copies
// quietly drifting apart, or from sizing mechanisms that behaved
// differently depending on context. Routing every caller through this
// one function makes that class of bug structurally impossible rather
// than something to remember to keep in sync.
//
// Design principle: every media box is delivered a REAL, DEFINITE size
// (an explicit pixel height, or a CSS aspect-ratio box) applied
// directly to the element that needs it — never a plain percentage
// (`h-full`) inherited through nested flex/grid wrapper layers, and
// never left to the image's own intrinsic pixel dimensions. Two
// concrete bugs came from *not* following this:
//  - A percentage chain can be silently overridden by an ancestor's
//    own content-based sizing (min-height:auto) — fixed 2026-09-05 by
//    switching resized rows to an explicit pixel height.
//  - Sizing a standalone image by its own intrinsic size (max-width:
//    100%, height:auto) only ever shrinks a *large* source photo to
//    fit — it never enlarges a *small* one to fill extra space, so two
//    images could look wildly different sizes at the same container
//    width purely because of their original resolution (2026-09-06).
//    Fixed by giving every standalone image a responsive aspect-ratio
//    box + object-contain, so it always scales to fill the available
//    width (up or down) regardless of its native resolution.
//
// Standalone (non-row) images/video are never cropped — decision
// 2026-09-05, direct request: this is an artist's portfolio, so an
// image should always show in full rather than being auto-cropped.
// object-contain (never object-cover) is what guarantees that here.

export type MediaSizeMode =
  // Not in a row, OR in a row that hasn't had its height dragged yet.
  // Sized as a responsive aspect-ratio box — scales with the
  // container's width at any size, never crops, and (unlike sizing by
  // the image's own intrinsic dimensions) scales small source images
  // UP to fill the space too, not just large ones down.
  | { kind: "natural" }
  // In a row whose height HAS been set (by dragging the row's height
  // handle). Every block sharing that row gets this exact pixel height.
  | { kind: "row"; rowHeightPx: number };

// Aspect ratio for the natural-mode box (width / height). 4:3 matches
// the default box already used elsewhere in MediaPicker (Artist
// profile photo, Artwork main image), keeping the convention
// consistent app-wide. Object-contain means a portrait-oriented image
// still shows in full (letterboxed left/right) rather than being
// forced into a landscape crop — if a lot of the art is portrait-
// oriented, a taller ratio (e.g. "3 / 4") may suit it better; easy to
// change here in one place since every renderer reads it from here.
const NATURAL_ASPECT_CLASS = "aspect-[4/3]";

export type MediaBoxProps = {
  previewClassName: string;
  previewStyle: { height?: number };
  previewObjectFit: "contain";
};

// For MediaPicker (editor) callers. Row mode delivers an explicit pixel
// height (see design note above); natural mode delivers the responsive
// aspect-ratio box — both use MediaPicker's default "box" fit (a sized
// box the image/video fills via object-fit), just with a different box.
// Applies identically whether or not the slot has a picked image yet,
// so an empty "add image" slot is sized exactly like a filled one and
// can never collapse to a sliver.
export function getMediaBoxProps(mode: MediaSizeMode): MediaBoxProps {
  if (mode.kind === "row") {
    return {
      previewClassName: "h-full w-full",
      previewStyle: { height: mode.rowHeightPx },
      previewObjectFit: "contain",
    };
  }
  return {
    previewClassName: `${NATURAL_ASPECT_CLASS} w-full`,
    previewStyle: {},
    previewObjectFit: "contain",
  };
}

// The equivalent sizing for plain <img>/<video> elements — used by
// LiveBlockPreview.tsx and BlockRenderer.tsx, which render display-only
// media (no MediaPicker, no click-to-change) but must size it by the
// exact same rule so the editor and the real page can never disagree.
// `figureClassName` goes on the wrapping <figure>/<div> (establishes
// the box); `mediaClassName`/`mediaStyle` go on the <img>/<video>
// itself (fills that box via object-contain).
export type PlainMediaSizing = {
  figureClassName: string;
  mediaClassName: string;
  mediaStyle: { height?: number };
};

export function getPlainMediaSizing(mode: MediaSizeMode): PlainMediaSizing {
  if (mode.kind === "row") {
    return {
      figureClassName: "h-full",
      mediaClassName: "h-full w-full rounded-md object-contain object-left-top",
      mediaStyle: { height: mode.rowHeightPx },
    };
  }
  return {
    figureClassName: `${NATURAL_ASPECT_CLASS} w-full`,
    mediaClassName: "h-full w-full rounded-md object-contain",
    mediaStyle: {},
  };
}
