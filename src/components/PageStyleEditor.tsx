"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PAGE_STYLE_TYPES, isPageStyleType, type PageStyleType } from "@/lib/pageStyleTypes";
import {
  CANVAS_LIMITS,
  GRID_SPACING_LIMITS,
  PAGE_MARGIN_LIMITS,
  TEXT_COMPONENT_TYPES,
  TEXT_LOOKS,
  TEXT_SIZE_LIMITS,
  cleanCanvas,
  cleanGridSpacing,
  cleanPageMargins,
  cleanTextStyle,
  emptyLayout,
  type CanvasLayout,
  type CustomLayout,
  type GridSpacing,
  type PageMargin,
  type PageMargins,
  type PageStyleLayout,
  type SectionLayout,
  type TextStyle,
  type TextStyles,
} from "@/lib/pageStyleLayout";
import { SITE_FONTS, SITE_FONT_KINDS, isSiteFontId } from "@/lib/siteFonts";
import NumberField from "@/components/NumberField";

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
// Section and Private / Custom are laid out in their visual editors
// (VisualLayoutEditor / SectionVisualEditor, 2026-10-07), which replace
// the Preview while they're edited — components sized, spaced and
// aligned by hand, with each one's own numbers (and a Sliding doors
// component's settings) on its bar there. Here: the background colour,
// then a Fine-tune section, closed by default, with the exact page
// margins (2026-10-06, desktop and phone) and the spacing of grids of
// images (2026-10-05) — and, for Private / Custom, how the text in its
// Header, Text and Text grid components looks (2026-10-07, from Craig's
// mockup: font, size, style and colour).
//
// Private / Custom also has an optional background image (the image
// itself chosen on the page). Section is a fixed layout — byline,
// artwork grid, Description — with an optional video below the
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

            <FineTuneSection
              margins={section.margins}
              gridSpacing={section.gridSpacing}
              onMargins={(margins) => setSection({ ...section, margins })}
              onGridSpacing={(gridSpacing) => setSection({ ...section, gridSpacing })}
            />
          </div>
        )}

        {draft.type === "PRIVATE" && (
          <div className="mt-2 flex flex-col gap-2.5">
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

            <FineTuneSection
              margins={custom.margins}
              gridSpacing={custom.gridSpacing}
              onMargins={(margins) => setCustom({ ...custom, margins })}
              onGridSpacing={(gridSpacing) => setCustom({ ...custom, gridSpacing })}
            >
              <TextStylesControl
                value={custom.textStyles}
                onChange={(textStyles) => setCustom({ ...custom, textStyles })}
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

// The exact page margins and grid spacing, closed by default (2026-10-07)
// — shared by Section and Private / Custom — then anything a type adds
// (`children`).
function FineTuneSection({
  margins,
  gridSpacing,
  onMargins,
  onGridSpacing,
  children,
}: {
  margins: PageMargins;
  gridSpacing: GridSpacing;
  onMargins: (margins: PageMargins) => void;
  onGridSpacing: (gridSpacing: GridSpacing) => void;
  children?: ReactNode;
}) {
  return (
    <details className="rounded-md border border-neutral-300">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-neutral-700">
        Fine-tune
      </summary>
      <div className="flex flex-col gap-2.5 border-t border-neutral-200 p-2">
        <PageMarginControl value={margins} onChange={onMargins} />
        <GridSpacingControl value={gridSpacing} onChange={onGridSpacing} />
        {children}
      </div>
    </details>
  );
}

// Vertical and horizontal grid spacing (2026-10-05, from Craig's mockup).
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
// desktop and for phone.
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

// How the text in each text component type looks (2026-10-07, from
// Craig's mockup) — one box each for Header, Text and Text grid.
function TextStylesControl({
  value,
  onChange,
}: {
  value: TextStyles;
  onChange: (value: TextStyles) => void;
}) {
  return (
    <>
      {TEXT_COMPONENT_TYPES.map((t) => (
        <TextStyleBox
          key={t.value}
          label={t.label}
          value={value[t.value]}
          onChange={(style) => onChange({ ...value, [t.value]: style })}
        />
      ))}
    </>
  );
}

// One component type's Font and Size, then Style and Colour. Anything
// left blank keeps the text's own look.
function TextStyleBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextStyle;
  onChange: (value: TextStyle) => void;
}) {
  const set = (patch: Partial<TextStyle>) => onChange(cleanTextStyle({ ...value, ...patch }));
  const selectClass = (empty: boolean) =>
    `min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm ${
      empty ? "text-neutral-400" : "text-neutral-800"
    }`;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
      <p className="text-sm text-neutral-700">{label}</p>
      <div className="flex items-center gap-2">
        <select
          value={value.font ?? ""}
          onChange={(e) => set({ font: isSiteFontId(e.target.value) ? e.target.value : null })}
          aria-label={`${label} font`}
          className={selectClass(!value.font)}
        >
          <option value="">Font</option>
          {SITE_FONT_KINDS.map((kind) => (
            <optgroup key={kind} label={kind}>
              {SITE_FONTS.filter((f) => f.kind === kind).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <SizeField label={label} value={value.size} onCommit={(size) => set({ size })} />
      </div>
      <div className="flex items-center gap-2">
        <select
          value={value.look ?? ""}
          onChange={(e) =>
            set({ look: TEXT_LOOKS.find((l) => l.value === e.target.value)?.value ?? null })
          }
          aria-label={`${label} style`}
          className={selectClass(!value.look)}
        >
          <option value="">Style</option>
          {TEXT_LOOKS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <ColourField label={label} value={value.colour} onChange={(colour) => set({ colour })} />
      </div>
    </div>
  );
}

// Text size in pixels, applied when the box is left (or Enter); blank =
// the text's own size.
function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  useEffect(() => setText(value?.toString() ?? ""), [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setText(value?.toString() ?? "");
      return;
    }
    if (n !== value) onCommit(n);
  };

  return (
    <label className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        min={TEXT_SIZE_LIMITS.min}
        max={TEXT_SIZE_LIMITS.max}
        step={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Size"
        aria-label={`${label} size`}
        className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
      />
      <span className="text-xs text-neutral-400">px</span>
    </label>
  );
}

// "+ Colour", or the chosen colour with ✕ to clear it.
function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange("#000000")}
        className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
      >
        + Colour
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        className="h-5 w-5 cursor-pointer rounded border border-neutral-300 p-0"
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label={`Clear ${label} colour`}
        className="text-xs text-neutral-400 hover:text-red-600"
      >
        ✕
      </button>
    </span>
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
