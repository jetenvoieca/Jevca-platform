"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  GRID_SPACING_LIMITS,
  PAGE_MARGIN_LIMITS,
  cleanGridSpacing,
  cleanPageMargins,
  type GridSpacing,
  type PageMargin,
  type PageMargins,
} from "@/lib/rowLayout";
import {
  TEXT_COMPONENT_TYPES,
  TEXT_LOOKS,
  TEXT_SIZE_LIMITS,
  LETTER_SPACING_LIMITS,
  cleanTextStyle,
  type FontChoice,
  type TextStyle,
  type TextStyles,
} from "@/lib/textStyle";
import NumberField from "@/components/NumberField";

// The settings boxes shared by the Page Styles and Mail Templates editor
// panels (2026-10-08, moved out of PageStyleEditor): colours, the
// Fine-tune section with the exact margins, grid spacing and the text
// components' look.

const smallButton =
  "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

// "+ Add <label>", or the chosen colour with Remove.
export function ColourControl({
  label,
  value,
  initial,
  onChange,
}: {
  label: string;
  value: string | null;
  // The colour picked when it's first added.
  initial: string;
  onChange: (value: string | null) => void;
}) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange(initial)} className={smallButton}>
        + Add {label.toLowerCase()}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
      />
      <span className="flex-1 text-sm text-neutral-700">
        {label} <span className="text-neutral-400">{value}</span>
      </span>
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

// The exact margins and grid spacing, closed by default (2026-10-07),
// then the text components' look (`children`).
export function FineTuneSection({
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

// The margin's four values.
const MARGIN_FIELDS: { device: keyof PageMargins; side: keyof PageMargin; label: string }[] = [
  { device: "desktop", side: "vertical", label: "Desktop margin, top & bottom" },
  { device: "desktop", side: "horizontal", label: "Desktop margin, left & right" },
  { device: "phone", side: "vertical", label: "Phone margin, top & bottom" },
  { device: "phone", side: "horizontal", label: "Phone margin, left & right" },
];

// The margin (2026-10-06): top & bottom and left & right, for desktop
// and for phone.
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
// Craig's mockup) — one box each for Header, Text and Text grid, with
// the layout's own font list. `scales`: a page's texts, which can have a
// smallest size.
export function TextStylesControl<F extends string>({
  value,
  fonts,
  kinds,
  isFont,
  scales = false,
  onChange,
}: {
  value: TextStyles<F>;
  fonts: readonly FontChoice<F>[];
  kinds: readonly string[];
  isFont: (value: unknown) => value is F;
  scales?: boolean;
  onChange: (value: TextStyles<F>) => void;
}) {
  return (
    <>
      {TEXT_COMPONENT_TYPES.map((t) => (
        <TextStyleBox
          key={t.value}
          label={t.label}
          value={value[t.value]}
          fonts={fonts}
          kinds={kinds}
          isFont={isFont}
          scales={scales}
          onChange={(style) => onChange({ ...value, [t.value]: style })}
        />
      ))}
    </>
  );
}

// One component type's (or one component's) Font and Size, then Style
// and Colour, then the smallest size (`scales`, a page's text — once it
// has a size) and the letter spacing. Anything left blank keeps the
// text's own look.
export function TextStyleBox<F extends string>({
  label,
  value,
  fonts,
  kinds,
  isFont,
  scales = false,
  onChange,
}: {
  label: string;
  value: TextStyle<F>;
  fonts: readonly FontChoice<F>[];
  kinds: readonly string[];
  isFont: (value: unknown) => value is F;
  scales?: boolean;
  onChange: (value: TextStyle<F>) => void;
}) {
  const set = (patch: Partial<TextStyle<F>>) =>
    onChange(cleanTextStyle({ ...value, ...patch }, isFont));
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
          onChange={(e) => set({ font: isFont(e.target.value) ? e.target.value : null })}
          aria-label={`${label} font`}
          className={selectClass(!value.font)}
        >
          <option value="">Font</option>
          {kinds.map((kind) => (
            <optgroup key={kind} label={kind}>
              {fonts
                .filter((f) => f.kind === kind)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <OptionalNumberField
          label={`${label} size`}
          placeholder="Size"
          unit="px"
          limits={TEXT_SIZE_LIMITS}
          value={value.size}
          onCommit={(size) => set({ size })}
        />
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
      <div className="flex items-center justify-end gap-2">
        {scales && value.size !== null && (
          <span className="flex flex-1 items-center gap-1 text-xs text-neutral-500">
            Smallest
            <OptionalNumberField
              label={`${label} smallest size`}
              placeholder="—"
              unit="px"
              limits={{ min: TEXT_SIZE_LIMITS.min, max: value.size }}
              value={value.smallest}
              onCommit={(smallest) => set({ smallest })}
            />
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          Letter spacing
          <OptionalNumberField
            label={`${label} letter spacing`}
            placeholder="—"
            unit="%"
            limits={LETTER_SPACING_LIMITS}
            value={value.spacing}
            onCommit={(spacing) => set({ spacing })}
          />
        </span>
      </div>
    </div>
  );
}

// A number applied when the box is left (or Enter); blank = not set.
function OptionalNumberField({
  label,
  placeholder,
  unit,
  limits,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  unit: string;
  limits: { min: number; max: number };
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
        min={limits.min}
        max={limits.max}
        step={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label={label}
        className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
      />
      <span className="text-xs text-neutral-400">{unit}</span>
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
