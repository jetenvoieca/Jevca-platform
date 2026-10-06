"use client";

import type { ReactNode } from "react";
import {
  MENU_BEHAVIOURS,
  MENU_KINDS,
  MENU_POSITIONS,
  MENU_SHADOWS,
  MENU_STYLE_LIMITS,
  normalizeMenuStyle,
  type MenuStyleLayout,
} from "@/lib/menuStyleLayout";
import NumberField from "@/components/NumberField";

// What's being edited: the menu's name and settings. Held by
// MenuStylesManager so its Preview shows every change straight away.
export type MenuStyleDraft = { name: string; layout: MenuStyleLayout };

// Templates → Menus' Add / Edit panel (2026-10-06): sits in the
// right-hand column, beside the Preview, and stays open until Close.
// Name, then Layout (kind, position, behaviour), then Design (colours,
// text size, rounding, shadow, blur) — see lib/menuStyleLayout.ts.
// Saving is automatic (see MenuStylesManager); `status` reports it.
export default function MenuStyleEditor({
  draft,
  onChange,
  status,
  onClose,
}: {
  draft: MenuStyleDraft;
  onChange: (draft: MenuStyleDraft) => void;
  status: { text: string; isError: boolean };
  onClose: () => void;
}) {
  const { layout } = draft;
  const set = (patch: Partial<MenuStyleLayout>) =>
    onChange({ ...draft, layout: normalizeMenuStyle({ ...layout, ...patch }) });
  const l = MENU_STYLE_LIMITS;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Menu name"
          aria-label="Menu name"
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />

        <Group title="Layout">
          <Choice
            label="Type"
            value={layout.kind}
            choices={MENU_KINDS}
            onChange={(kind) => set({ kind })}
          />
          <Choice
            label="Position"
            value={layout.position}
            choices={MENU_POSITIONS}
            onChange={(position) => set({ position })}
          />
          <Choice
            label="Behaviour"
            value={layout.behaviour}
            choices={MENU_BEHAVIOURS}
            onChange={(behaviour) => set({ behaviour })}
          />
        </Group>

        <Group title="Design">
          <ColourField
            label="Background"
            value={layout.backgroundColor}
            onChange={(backgroundColor) => set({ backgroundColor })}
          />
          <NumberField
            label="Background opacity"
            unit="%"
            step={5}
            value={layout.backgroundOpacity}
            limits={l.backgroundOpacity}
            onCommit={(backgroundOpacity) => set({ backgroundOpacity })}
            wide
          />
          <ColourField
            label="Text"
            value={layout.textColor}
            onChange={(textColor) => set({ textColor })}
          />
          <NumberField
            label="Text size"
            unit="pixels"
            step={1}
            value={layout.textSize}
            limits={l.textSize}
            onCommit={(textSize) => set({ textSize })}
            wide
          />
          <ColourField
            label="Current page highlight"
            value={layout.highlightColor}
            onChange={(highlightColor) => set({ highlightColor })}
          />
          <NumberField
            label="Corner rounding"
            unit="pixels"
            step={1}
            value={layout.rounding}
            limits={l.rounding}
            onCommit={(rounding) => set({ rounding })}
            wide
          />
          <Choice
            label="Shadow"
            value={layout.shadow}
            choices={MENU_SHADOWS}
            onChange={(shadow) => set({ shadow })}
          />
          <NumberField
            label="Background blur"
            unit="pixels"
            step={1}
            value={layout.blur}
            limits={l.blur}
            onCommit={(blur) => set({ blur })}
            wide
          />
        </Group>

        <p className="text-xs text-neutral-400">
          The menu lists each site&apos;s Live Pages, in order. On phones it always opens full
          screen.
        </p>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="w-24 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="flex-1">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
      />
      <span className="w-16 text-xs text-neutral-400">{value}</span>
    </label>
  );
}
