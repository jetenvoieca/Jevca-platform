"use client";

import { Fragment, useEffect, useState } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import { PAGE_STYLE_TYPES, isPageStyleType, type PageStyleType } from "@/lib/pageStyleTypes";
import {
  BLOCK_SPACING_LIMITS,
  BLOCK_WIDTH_LIMITS,
  CANVAS_LIMITS,
  GRID_SPACING_LIMITS,
  PAGE_MARGIN_LIMITS,
  SLIDING_DOORS_LIMITS,
  addLayoutBlock,
  blockTypeLabel,
  blockWidthOf,
  cleanBlockSpacing,
  cleanBlockWidth,
  cleanCanvas,
  cleanGridSpacing,
  cleanPageMargins,
  emptyLayout,
  moveLayoutRow,
  removeLayoutBlock,
  rowKey,
  rowSpacingOf,
  updateBlockWidth,
  updateSlidingDoors,
  type CanvasLayout,
  type CustomLayout,
  type DoorsHeight,
  type GridSpacing,
  type LayoutBlockType,
  type PageMargin,
  type PageMargins,
  type PageStyleLayout,
  type RowSpacing,
  type SectionLayout,
  type SectionSpacing,
  type SectionWidths,
  type SlidingDoorsSettings,
} from "@/lib/pageStyleLayout";
import AddBlockModal, { type BlockPlacement } from "@/components/AddBlockModal";

// What's being edited: the Style name, the Style Type ("" until one is
// chosen) and that type's layout. Held by PageStylesManager so its
// Preview can show every change straight away.
export type PageStyleDraft = {
  name: string;
  type: PageStyleType | "";
  custom: CustomLayout;
  section: SectionLayout;
  canvas: CanvasLayout;
};

export const EMPTY_CUSTOM = (emptyLayout("PRIVATE") as Extract<PageStyleLayout, { type: "PRIVATE" }>)
  .layout;

export const EMPTY_SECTION = (emptyLayout("SECTION") as Extract<PageStyleLayout, { type: "SECTION" }>)
  .layout;

export const EMPTY_CANVAS = (emptyLayout("CANVAS") as Extract<PageStyleLayout, { type: "CANVAS" }>)
  .layout;

export function draftFrom(name: string, style: PageStyleLayout | null): PageStyleDraft {
  return {
    name,
    type: style?.type ?? "",
    custom: style?.type === "PRIVATE" ? style.layout : EMPTY_CUSTOM,
    section: style?.type === "SECTION" ? style.layout : EMPTY_SECTION,
    canvas: style?.type === "CANVAS" ? style.layout : EMPTY_CANVAS,
  };
}

// The draft as a layout, or null until a Style Type is chosen.
export function draftLayout(draft: PageStyleDraft): PageStyleLayout | null {
  if (draft.type === "SECTION") return { type: "SECTION", layout: draft.section };
  if (draft.type === "PRIVATE") return { type: "PRIVATE", layout: draft.custom };
  if (draft.type === "CANVAS") return { type: "CANVAS", layout: draft.canvas };
  return null;
}

const smallButton =
  "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

// The Sliding doors number settings shown in the editor, in order. Gap
// only applies to pairs.
const DOORS_FIELDS: {
  key: Exclude<keyof SlidingDoorsSettings, "perSlide" | "height">;
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: "duration", label: "Duration", unit: "seconds", step: 0.5 },
  { key: "speed", label: "Slide speed", unit: "seconds", step: 0.5 },
  { key: "gap", label: "Gap", unit: "pixels", step: 1 },
];

// The Sliding doors panels' height (2026-10-06), desktop and phone.
const DOORS_HEIGHT_FIELDS: { key: keyof DoorsHeight; label: string }[] = [
  { key: "desktop", label: "Height, desktop" },
  { key: "phone", label: "Height, phone" },
];

// A Section's parts, for its Widths box.
const SECTION_WIDTH_FIELDS: { key: keyof SectionWidths; label: string }[] = [
  { key: "byline", label: "Byline width" },
  { key: "grid", label: "Grid width" },
  { key: "description", label: "Description width" },
  { key: "video", label: "Video width" },
];

// The page margin's four values, for its box.
const MARGIN_FIELDS: { device: keyof PageMargins; side: keyof PageMargin; label: string }[] = [
  { device: "desktop", side: "vertical", label: "Desktop margin, top & bottom" },
  { device: "desktop", side: "horizontal", label: "Desktop margin, left & right" },
  { device: "phone", side: "vertical", label: "Phone margin, top & bottom" },
  { device: "phone", side: "horizontal", label: "Phone margin, left & right" },
];

// Templates → Page Styles' Add / Edit panel (2026-10-04, from Craig's
// mockups): sits in the right-hand column, beside the Preview, and stays
// open until Close. Style name, Style Type, then the chosen type's own
// layout controls — layout only, no content.
//
// Section and Private / Custom set their grid spacing (2026-10-05) for
// grids of images, the page margin (2026-10-06, desktop and phone), the
// spacing of every gap between blocks separately and every block's
// width (2026-10-05, % of the page, centred): Section in its own boxes,
// Private / Custom in each row of the Layout list (width per block, ↔
// between side-by-side blocks, ↕ below the row).
//
// Private / Custom: background colour and image, then the Layout list,
// then Sliding doors settings for any Sliding doors blocks (including
// the square panels' height, 2026-10-06, desktop and phone). New blocks
// (Header included) are added from "+ Add block", which opens
// AddBlockModal (2026-10-05) — keeping adding separate from arranging.
//
// Section is a fixed layout — byline, artwork grid, Description — with
// an optional background colour and an optional video below the
// Description.
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
  const { custom, section, canvas } = draft;
  const [adding, setAdding] = useState(false);
  const setCustom = (next: CustomLayout) => onChange({ ...draft, custom: next });
  const setSection = (next: SectionLayout) => onChange({ ...draft, section: next });
  const setCanvas = (next: CanvasLayout) => onChange({ ...draft, canvas: cleanCanvas(next) });

  const changeType = (value: string) => {
    if (!isPageStyleType(value)) return;
    // A different type has a different layout, so start it afresh.
    onChange({
      ...draft,
      type: value,
      custom: EMPTY_CUSTOM,
      section: EMPTY_SECTION,
      canvas: EMPTY_CANVAS,
    });
  };

  const addBlock = (blockType: LayoutBlockType, placement: BlockPlacement) => {
    setCustom({ ...custom, blocks: addLayoutBlock(custom.blocks, blockType, placement) });
    setAdding(false);
  };

  const setDoors = (id: string, doors: SlidingDoorsSettings) =>
    setCustom({ ...custom, blocks: updateSlidingDoors(custom.blocks, id, doors) });

  const setRowSpacing = (key: string, patch: Partial<RowSpacing>) => {
    const current = rowSpacingOf(custom, key);
    setCustom({
      ...custom,
      rowSpacing: {
        ...custom.rowSpacing,
        [key]: {
          below: cleanBlockSpacing(patch.below ?? current.below),
          between: cleanBlockSpacing(patch.between ?? current.between),
        },
      },
    });
  };

  const setSectionSpacing = (key: keyof SectionSpacing, value: number) =>
    setSection({ ...section, spacing: { ...section.spacing, [key]: cleanBlockSpacing(value) } });

  const setSectionWidth = (key: keyof SectionWidths, value: number) =>
    setSection({ ...section, widths: { ...section.widths, [key]: cleanBlockWidth(value) } });

  const rows = groupBlocksByRow(custom.blocks);
  const doorsBlocks = custom.blocks.filter((b) => b.type === "slidingdoors" && b.doors);

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
            <BackgroundColourControl
              value={canvas.backgroundColor}
              onChange={(backgroundColor) => setCanvas({ ...canvas, backgroundColor })}
            />
            <p className="text-xs text-neutral-400">
              The curations are chosen and dragged into place on each page; the canvas grows to
              fit them. The curation nearest the centre of the screen opens.
            </p>
          </div>
        )}

        {draft.type === "SECTION" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <GridSpacingControl
              value={section.gridSpacing}
              onChange={(gridSpacing) => setSection({ ...section, gridSpacing })}
            />
            <PageMarginControl
              value={section.margins}
              onChange={(margins) => setSection({ ...section, margins })}
            />
            <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
              {SECTION_WIDTH_FIELDS.filter((f) => f.key !== "video" || section.video).map((f) => (
                <NumberField
                  key={f.key}
                  label={f.label}
                  unit="%"
                  step={5}
                  value={section.widths[f.key]}
                  limits={BLOCK_WIDTH_LIMITS}
                  onCommit={(v) => setSectionWidth(f.key, v)}
                  wide
                />
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
              <NumberField
                label="Space below byline"
                unit="pixels"
                step={1}
                value={section.spacing.belowByline}
                limits={BLOCK_SPACING_LIMITS}
                onCommit={(v) => setSectionSpacing("belowByline", v)}
                wide
              />
              <NumberField
                label="Space below grid"
                unit="pixels"
                step={1}
                value={section.spacing.belowGrid}
                limits={BLOCK_SPACING_LIMITS}
                onCommit={(v) => setSectionSpacing("belowGrid", v)}
                wide
              />
              {section.video && (
                <NumberField
                  label="Space below description"
                  unit="pixels"
                  step={1}
                  value={section.spacing.belowDescription}
                  limits={BLOCK_SPACING_LIMITS}
                  onCommit={(v) => setSectionSpacing("belowDescription", v)}
                  wide
                />
              )}
            </div>
            <BackgroundColourControl
              value={section.backgroundColor}
              onChange={(backgroundColor) => setSection({ ...section, backgroundColor })}
            />
            {section.video ? (
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
                <span className="flex-1 text-sm text-neutral-700">
                  Video — below the Description, chosen on the page
                </span>
                <button
                  type="button"
                  onClick={() => setSection({ ...section, video: false })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSection({ ...section, video: true })}
                className={smallButton}
              >
                + Video
              </button>
            )}
          </div>
        )}

        {draft.type === "PRIVATE" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <GridSpacingControl
              value={custom.gridSpacing}
              onChange={(gridSpacing) => setCustom({ ...custom, gridSpacing })}
            />

            <PageMarginControl
              value={custom.margins}
              onChange={(margins) => setCustom({ ...custom, margins })}
            />

            <BackgroundColourControl
              value={custom.backgroundColor}
              onChange={(backgroundColor) => setCustom({ ...custom, backgroundColor })}
            />

            {custom.backgroundImage ? (
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
                <span className="flex-1 text-sm text-neutral-700">
                  Background image — chosen on the page
                </span>
                <button
                  type="button"
                  onClick={() => setCustom({ ...custom, backgroundImage: false })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCustom({ ...custom, backgroundImage: true })}
                className={smallButton}
              >
                + Add background image
              </button>
            )}

            <div className="mt-2">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Layout
              </p>
              {rows.length === 0 && (
                <p className="mb-2 text-xs text-neutral-400">No blocks yet.</p>
              )}
              <div className="flex flex-col gap-1.5">
                {rows.map((row, i) => {
                  const key = rowKey(row);
                  const spacing = rowSpacingOf(custom, key);
                  return (
                    <Fragment key={key}>
                      <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-1.5">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex min-w-0 gap-1">
                            {row.map((b) => (
                              <span
                                key={b.id}
                                className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700"
                              >
                                <span className="truncate">{blockTypeLabel(b.type)}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCustom({
                                      ...custom,
                                      blocks: removeLayoutBlock(custom.blocks, b.id),
                                    })
                                  }
                                  aria-label={`Remove ${blockTypeLabel(b.type)}`}
                                  className="text-neutral-400 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                          {row.map((b) => (
                            <NumberField
                              key={b.id}
                              label={row.length > 1 ? `${blockTypeLabel(b.type)} width` : "Width"}
                              unit="%"
                              step={5}
                              value={blockWidthOf(b)}
                              limits={BLOCK_WIDTH_LIMITS}
                              onCommit={(width) =>
                                setCustom({
                                  ...custom,
                                  blocks: updateBlockWidth(custom.blocks, b.id, width),
                                })
                              }
                              compact
                            />
                          ))}
                          {row.length > 1 && (
                            <NumberField
                              label="↔ Between"
                              unit="px"
                              step={1}
                              value={spacing.between}
                              limits={BLOCK_SPACING_LIMITS}
                              onCommit={(between) => setRowSpacing(key, { between })}
                              compact
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCustom({ ...custom, blocks: moveLayoutRow(custom.blocks, i, -1) })
                          }
                          disabled={i === 0}
                          aria-label="Move up"
                          className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustom({ ...custom, blocks: moveLayoutRow(custom.blocks, i, 1) })
                          }
                          disabled={i === rows.length - 1}
                          aria-label="Move down"
                          className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                      {i < rows.length - 1 && (
                        <div className="flex justify-center">
                          <NumberField
                            label="↕ Space"
                            unit="px"
                            step={1}
                            value={spacing.below}
                            limits={BLOCK_SPACING_LIMITS}
                            onCommit={(below) => setRowSpacing(key, { below })}
                            compact
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 w-full rounded-md border border-dashed border-neutral-400 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                + Add block
              </button>
            </div>

            {doorsBlocks.map((b, i) => {
              const doors = b.doors!;
              return (
                <div key={b.id} className="rounded-md border border-neutral-200 p-2">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Sliding doors{doorsBlocks.length > 1 ? ` ${i + 1}` : ""}
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                      <span className="w-24 shrink-0">Show</span>
                      <select
                        value={doors.perSlide}
                        onChange={(e) =>
                          setDoors(b.id, { ...doors, perSlide: e.target.value === "1" ? 1 : 2 })
                        }
                        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      >
                        <option value={2}>Pairs</option>
                        <option value={1}>One at a time</option>
                      </select>
                    </label>
                    {DOORS_FIELDS.filter((f) => f.key !== "gap" || doors.perSlide === 2).map(
                      (f) => (
                        <NumberField
                          key={f.key}
                          label={f.label}
                          unit={f.unit}
                          step={f.step}
                          value={doors[f.key]}
                          limits={SLIDING_DOORS_LIMITS[f.key]}
                          onCommit={(value) => setDoors(b.id, { ...doors, [f.key]: value })}
                        />
                      )
                    )}
                    {DOORS_HEIGHT_FIELDS.map((f) => (
                      <NumberField
                        key={f.key}
                        label={f.label}
                        unit="% of screen"
                        step={5}
                        value={doors.height[f.key]}
                        limits={SLIDING_DOORS_LIMITS.height}
                        onCommit={(value) =>
                          setDoors(b.id, { ...doors, height: { ...doors.height, [f.key]: value } })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
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

      {adding && (
        <AddBlockModal
          canPlaceBeside={custom.blocks.length > 0}
          onAdd={addBlock}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// Vertical and horizontal grid spacing (2026-10-05, from Craig's mockup)
// — shared by Section and Private / Custom.
function GridSpacingControl({
  value,
  onChange,
}: {
  value: GridSpacing;
  onChange: (value: GridSpacing) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
      <NumberField
        label="Vertical grid spacing"
        unit="pixels"
        step={1}
        value={value.vertical}
        limits={GRID_SPACING_LIMITS.vertical}
        onCommit={(vertical) => onChange(cleanGridSpacing({ ...value, vertical }))}
        wide
      />
      <NumberField
        label="Horizontal grid spacing"
        unit="pixels"
        step={1}
        value={value.horizontal}
        limits={GRID_SPACING_LIMITS.horizontal}
        onCommit={(horizontal) => onChange(cleanGridSpacing({ ...value, horizontal }))}
        wide
      />
    </div>
  );
}

// The page margin (2026-10-06): top & bottom and left & right, for
// desktop and for phone — shared by Section and Private / Custom.
function PageMarginControl({
  value,
  onChange,
}: {
  value: PageMargins;
  onChange: (value: PageMargins) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
      {MARGIN_FIELDS.map((f) => (
        <NumberField
          key={`${f.device}-${f.side}`}
          label={f.label}
          unit="pixels"
          step={1}
          value={value[f.device][f.side]}
          limits={PAGE_MARGIN_LIMITS}
          onCommit={(v) =>
            onChange(cleanPageMargins({ ...value, [f.device]: { ...value[f.device], [f.side]: v } }))
          }
          wide
        />
      ))}
    </div>
  );
}

// "+ Add background colour", or the chosen colour with Remove — shared
// by every Style Type.
function BackgroundColourControl({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange("#ffffff")} className={smallButton}>
        + Add background colour
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Background colour"
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
      />
      <span className="flex-1 text-sm text-neutral-700">{value}</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="text-xs text-red-500 hover:underline"
      >
        Remove
      </button>
    </div>
  );
}

// A number, applied when the box is left (or Enter). Kept within its
// limits when saved; anything that isn't a number goes back to the
// current value. `wide` gives room for a longer label; `compact` is the
// small version used inside the Layout list.
function NumberField({
  label,
  unit,
  step,
  value,
  limits,
  onCommit,
  wide = false,
  compact = false,
}: {
  label: string;
  unit: string;
  step: number;
  value: number;
  limits: { min: number; max: number };
  onCommit: (value: number) => void;
  wide?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };

  const labelClass = compact ? "shrink-0" : `${wide ? "flex-1" : "w-24"} shrink-0`;

  return (
    <label
      className={`flex items-center gap-2 ${
        compact ? "text-xs text-neutral-500" : "text-sm text-neutral-700"
      }`}
    >
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        min={limits.min}
        max={limits.max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`rounded-md border border-neutral-300 px-2 ${
          compact ? "w-14 py-0.5 text-xs" : "w-16 py-1 text-sm"
        }`}
      />
      <span className="text-xs text-neutral-400">{unit}</span>
    </label>
  );
}
