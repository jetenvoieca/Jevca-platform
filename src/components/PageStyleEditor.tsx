"use client";

import { Fragment, useEffect, useState } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import { PAGE_STYLE_TYPES, isPageStyleType, type PageStyleType } from "@/lib/pageStyleTypes";
import {
  BLOCK_SPACING_LIMITS,
  BLOCK_WIDTH_LIMITS,
  GRID_SPACING_LIMITS,
  LAYOUT_BLOCK_TYPES,
  SLIDING_DOORS_LIMITS,
  addLayoutBlock,
  blockTypeLabel,
  blockWidthOf,
  cleanBlockSpacing,
  cleanBlockWidth,
  cleanGridSpacing,
  emptyLayout,
  moveLayoutRow,
  removeLayoutBlock,
  rowKey,
  rowSpacingOf,
  updateBlockWidth,
  updateSlidingDoors,
  type CustomLayout,
  type GridSpacing,
  type LayoutBlockType,
  type PageStyleLayout,
  type RowSpacing,
  type SectionLayout,
  type SectionSpacing,
  type SectionWidths,
  type SlidingDoorsSettings,
} from "@/lib/pageStyleLayout";

// What's being edited: the Style name, the Style Type ("" until one is
// chosen) and that type's layout. Held by PageStylesManager so its
// Preview can show every change straight away.
export type PageStyleDraft = {
  name: string;
  type: PageStyleType | "";
  custom: CustomLayout;
  section: SectionLayout;
  // One-shot, like the old block editor: the next block added sits
  // beside the last row, then this resets.
  placement: "none" | "left" | "right";
};

export const EMPTY_CUSTOM = (emptyLayout("PRIVATE") as Extract<PageStyleLayout, { type: "PRIVATE" }>)
  .layout;

export const EMPTY_SECTION = (emptyLayout("SECTION") as Extract<PageStyleLayout, { type: "SECTION" }>)
  .layout;

export function draftFrom(name: string, style: PageStyleLayout | null): PageStyleDraft {
  return {
    name,
    type: style?.type ?? "",
    custom: style?.type === "PRIVATE" ? style.layout : EMPTY_CUSTOM,
    section: style?.type === "SECTION" ? style.layout : EMPTY_SECTION,
    placement: "none",
  };
}

// The draft as a layout, or null until a Style Type is chosen.
export function draftLayout(draft: PageStyleDraft): PageStyleLayout | null {
  if (draft.type === "SECTION") return { type: "SECTION", layout: draft.section };
  if (draft.type === "PRIVATE") return { type: "PRIVATE", layout: draft.custom };
  return null;
}

const smallButton =
  "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

// The Sliding doors number settings shown in the editor, in order. Gap
// only applies to pairs.
const DOORS_FIELDS: {
  key: Exclude<keyof SlidingDoorsSettings, "perSlide">;
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: "duration", label: "Duration", unit: "seconds", step: 0.5 },
  { key: "speed", label: "Slide speed", unit: "seconds", step: 0.5 },
  { key: "gap", label: "Gap", unit: "pixels", step: 1 },
];

// A Section's parts, for its Widths box.
const SECTION_WIDTH_FIELDS: { key: keyof SectionWidths; label: string }[] = [
  { key: "byline", label: "Byline width" },
  { key: "grid", label: "Grid width" },
  { key: "description", label: "Description width" },
  { key: "video", label: "Video width" },
];

// Templates → Page Styles' Add / Edit panel (2026-10-04, from Craig's
// mockups): sits in the right-hand column, beside the Preview, and stays
// open until Close. Style name, Style Type, then the chosen type's own
// layout controls — layout only, no content. Both types start with the
// grid spacing (2026-10-05) for their grids of images, and set the
// spacing of every gap between blocks separately and every block's
// width (2026-10-05, % of the page, centred): Section in its own
// boxes, Private / Custom in each row of the Layout list (width per
// block, ↔ between side-by-side blocks, ↕ below the row). Private /
// Custom offers the old block editor's controls, adding empty
// placeholders, plus Sliding doors (2026-10-05) — pairs or one at a
// time — with its Duration, Slide speed and (for pairs) Gap. Section is
// a fixed layout — byline, artwork grid, Description — with an optional
// background colour and an optional video below the Description. Saving
// is automatic (see PageStylesManager); `status` reports it.
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
  const { custom, section, placement } = draft;
  const setCustom = (next: CustomLayout) => onChange({ ...draft, custom: next });
  const setSection = (next: SectionLayout) => onChange({ ...draft, section: next });

  const changeType = (value: string) => {
    if (!isPageStyleType(value)) return;
    // A different type has a different layout, so start it afresh.
    onChange({
      ...draft,
      type: value,
      custom: EMPTY_CUSTOM,
      section: EMPTY_SECTION,
      placement: "none",
    });
  };

  const addBlock = (blockType: LayoutBlockType, where: "none" | "left" | "right") =>
    onChange({
      ...draft,
      custom: { ...custom, blocks: addLayoutBlock(custom.blocks, blockType, where) },
      placement: "none",
    });

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

        {draft.type === "SECTION" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <GridSpacingControl
              value={section.gridSpacing}
              onChange={(gridSpacing) => setSection({ ...section, gridSpacing })}
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

            <button type="button" onClick={() => addBlock("header", "none")} className={smallButton}>
              + Add Header
            </button>

            <BackgroundColourControl
              value={custom.backgroundColor}
              onChange={(backgroundColor) => setCustom({ ...custom, backgroundColor })}
            />

            {custom.backgroundImage ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 px-2 text-center">
                <span className="text-sm text-neutral-500">Background image — chosen on the page</span>
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
                className="flex h-28 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:bg-neutral-50"
              >
                + Add background Image
              </button>
            )}

            {rows.length > 0 && (
              <div className="mt-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Layout
                </p>
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
                                label={
                                  row.length > 1 ? `${blockTypeLabel(b.type)} width` : "Width"
                                }
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
              </div>
            )}

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
                  </div>
                </div>
              );
            })}

            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Add block</p>
              <div className="flex gap-1">
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={custom.blocks.length === 0}
                    onClick={() =>
                      onChange({ ...draft, placement: placement === side ? "none" : side })
                    }
                    className={`rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${
                      placement === side
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    {side === "left" ? "To left" : "To Right"}
                  </button>
                ))}
              </div>
            </div>
            {placement !== "none" && (
              <p className="text-xs text-amber-600">
                The next block sits to the {placement} of the last row.
              </p>
            )}
            {LAYOUT_BLOCK_TYPES.filter((t) => t.value !== "header").map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => addBlock(t.value, placement)}
                className={smallButton}
              >
                + {t.label}
              </button>
            ))}
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

// Vertical and horizontal grid spacing (2026-10-05, from Craig's mockup)
// — shared by both Style Types.
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

// "+ Add background colour", or the chosen colour with Remove — shared
// by both Style Types.
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
