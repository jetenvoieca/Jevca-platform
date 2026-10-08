"use client";

import { PAGE_STYLE_TYPES, isPageStyleType, type PageStyleType } from "@/lib/pageStyleTypes";
import {
  CANVAS_LIMITS,
  cleanCanvas,
  emptyLayout,
  type CanvasLayout,
  type BlockBuildLayout,
  type PageStyleLayout,
} from "@/lib/pageStyleLayout";
import { SITE_FONTS, SITE_FONT_KINDS, isSiteFontId } from "@/lib/siteFonts";
import NumberField from "@/components/NumberField";
import { ColourControl, FineTuneSection, TextStylesControl } from "@/components/layoutControls";

// What's being edited: the Style name, the Style Type ("" until one is
// chosen) and that type's layout. Held by PageStylesManager so its
// Preview can show every change straight away.
export type PageStyleDraft = {
  name: string;
  type: PageStyleType | "";
  blockBuild: BlockBuildLayout;
  canvas: CanvasLayout;
};

export const EMPTY_BLOCK_BUILD = (
  emptyLayout("BLOCK_BUILD") as Extract<PageStyleLayout, { type: "BLOCK_BUILD" }>
).layout;

export const EMPTY_CANVAS = (emptyLayout("CANVAS") as Extract<PageStyleLayout, { type: "CANVAS" }>)
  .layout;

export function draftFrom(name: string, style: PageStyleLayout | null): PageStyleDraft {
  return {
    name,
    type: style?.type ?? "",
    blockBuild: style?.type === "BLOCK_BUILD" ? style.layout : EMPTY_BLOCK_BUILD,
    canvas: style?.type === "CANVAS" ? style.layout : EMPTY_CANVAS,
  };
}

// The draft as a layout, or null until a Style Type is chosen.
export function draftLayout(draft: PageStyleDraft): PageStyleLayout | null {
  if (draft.type === "BLOCK_BUILD") return { type: "BLOCK_BUILD", layout: draft.blockBuild };
  if (draft.type === "CANVAS") return { type: "CANVAS", layout: draft.canvas };
  return null;
}

const smallButton =
  "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

// Templates → Page Styles' Add / Edit panel (2026-10-04, from Craig's
// mockups): sits in the right-hand column, beside the Preview, and stays
// open until Close. Style name, Style Type, then the chosen type's own
// layout controls — layout only, no content.
//
// Block Build (2026-10-07, was Private / Custom) is laid out in its
// visual editor (PageStyleLayoutEditor), which replaces the Preview while
// it's edited — components added, moved, sized, spaced and aligned by
// hand, with each one's own numbers (and a Sliding doors component's
// settings) on its bar there. Here: the background colour, an optional
// background image (the image itself chosen on the page), then a
// Fine-tune section, closed by default, with the exact page margins
// (2026-10-06, desktop and phone), the spacing of grids of images
// (2026-10-05) and how the text in its Header, Text and Text grid
// components looks (2026-10-07, from Craig's mockup: font, size, style
// and colour). The boxes are shared with Mail Templates (layoutControls).
//
// Canvas (2026-10-05): curation tile size, opening speed, opened size
// (the first work's size when a curation opens, times the tile size),
// scroll speed (how far the canvas moves per scroll or drag) and
// background colour; the curations themselves are chosen and placed on
// each page. No margin — a Canvas stays edge to edge.
//
// Saving is automatic (see PageStylesManager); `status` reports it.
export default function PageStyleEditor({
  draft,
  onChange,
  status,
  onClose,
}: {
  draft: PageStyleDraft;
  onChange: (draft: PageStyleDraft) => void;
  status: { text: string; isError: boolean };
  onClose: () => void;
}) {
  const { blockBuild, canvas } = draft;
  const setBlockBuild = (next: BlockBuildLayout) => onChange({ ...draft, blockBuild: next });
  const setCanvas = (next: CanvasLayout) => onChange({ ...draft, canvas: cleanCanvas(next) });

  const changeType = (value: string) => {
    if (!isPageStyleType(value)) return;
    // A different type has a different layout, so start it afresh.
    onChange({
      ...draft,
      type: value,
      blockBuild: EMPTY_BLOCK_BUILD,
      canvas: EMPTY_CANVAS,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Style name"
          aria-label="Style name"
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />
        <select
          value={draft.type}
          onChange={(e) => changeType(e.target.value)}
          aria-label="Style Type"
          className={`w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base ${
            draft.type ? "text-neutral-900" : "text-neutral-400"
          }`}
        >
          <option value="" disabled>
            Style Type
          </option>
          {PAGE_STYLE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {draft.type === "CANVAS" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
              <NumberField
                label="Curation tile size"
                unit="pixels"
                step={10}
                value={canvas.tileSize}
                limits={CANVAS_LIMITS.tileSize}
                onCommit={(tileSize) => setCanvas({ ...canvas, tileSize })}
                wide
              />
              <NumberField
                label="Opening speed"
                unit="seconds"
                step={0.1}
                value={canvas.openSpeed}
                limits={CANVAS_LIMITS.openSpeed}
                onCommit={(openSpeed) => setCanvas({ ...canvas, openSpeed })}
                wide
              />
              <NumberField
                label="Opened size"
                unit="× tile"
                step={0.1}
                value={canvas.openScale}
                limits={CANVAS_LIMITS.openScale}
                onCommit={(openScale) => setCanvas({ ...canvas, openScale })}
                wide
              />
              <NumberField
                label="Scroll speed"
                unit="× normal"
                step={0.1}
                value={canvas.scrollSpeed}
                limits={CANVAS_LIMITS.scrollSpeed}
                onCommit={(scrollSpeed) => setCanvas({ ...canvas, scrollSpeed })}
                wide
              />
            </div>
            <ColourControl
              label="Background colour"
              initial="#ffffff"
              value={canvas.backgroundColor}
              onChange={(backgroundColor) => setCanvas({ ...canvas, backgroundColor })}
            />
            <p className="text-xs text-neutral-400">
              The curations are chosen and dragged into place on each page; the canvas grows to
              fit them. The curation nearest the centre of the screen opens.
            </p>
          </div>
        )}

        {draft.type === "BLOCK_BUILD" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <ColourControl
              label="Background colour"
              initial="#ffffff"
              value={blockBuild.backgroundColor}
              onChange={(backgroundColor) => setBlockBuild({ ...blockBuild, backgroundColor })}
            />

            {blockBuild.backgroundImage ? (
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
                <span className="flex-1 text-sm text-neutral-700">
                  Background image — chosen on the page
                </span>
                <button
                  type="button"
                  onClick={() => setBlockBuild({ ...blockBuild, backgroundImage: false })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBlockBuild({ ...blockBuild, backgroundImage: true })}
                className={smallButton}
              >
                + Add background image
              </button>
            )}

            <FineTuneSection
              margins={blockBuild.margins}
              gridSpacing={blockBuild.gridSpacing}
              onMargins={(margins) => setBlockBuild({ ...blockBuild, margins })}
              onGridSpacing={(gridSpacing) => setBlockBuild({ ...blockBuild, gridSpacing })}
            >
              <TextStylesControl
                value={blockBuild.textStyles}
                fonts={SITE_FONTS}
                kinds={SITE_FONT_KINDS}
                isFont={isSiteFontId}
                onChange={(textStyles) => setBlockBuild({ ...blockBuild, textStyles })}
              />
            </FineTuneSection>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-3">
        <p className={`min-w-0 text-xs ${status.isError ? "text-red-600" : "text-neutral-500"}`}>
          {status.text}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
