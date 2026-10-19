"use client";

import type { ReactNode } from "react";
import {
  PRESENTATION_COLOURS,
  PRESENTATION_LABELS,
  PRESENTATION_LAYOUTS,
  PRESENTATION_LIMITS,
  PRESENTATION_PARTS,
  normalizePresentation,
  type PresentationSettings,
} from "@/lib/presentationTemplate";
import { SITE_FONTS, SITE_FONT_KINDS, type SiteFontId } from "@/lib/siteFonts";
import NumberField from "@/components/NumberField";

// What's being edited: the template's name and settings. Held by
// PresentationTemplatesManager so its Preview shows every change at once.
export type PresentationTemplateDraft = { name: string; settings: PresentationSettings };

// Templates → Presentations' Add / Edit panel (2026-10-19): sits in the
// right-hand column beside the Preview and stays open until Close. Name,
// then Layout, Colours, Text, Shape, Show (which details and buttons
// appear) and Wording — see lib/presentationTemplate.ts. Saving is
// automatic (see PresentationTemplatesManager); `status` reports it.
export default function PresentationTemplateEditor({
  draft,
  onChange,
  status,
  onClose,
}: {
  draft: PresentationTemplateDraft;
  onChange: (draft: PresentationTemplateDraft) => void;
  status: { text: string; isError: boolean };
  onClose: () => void;
}) {
  const { settings } = draft;
  const set = (patch: Partial<PresentationSettings>) =>
    onChange({ ...draft, settings: normalizePresentation({ ...settings, ...patch }) });
  const l = PRESENTATION_LIMITS;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Template name"
          aria-label="Template name"
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />

        <Group title="Layout">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="w-24 shrink-0">Picture</span>
            <select
              value={settings.layout}
              onChange={(e) => set({ layout: e.target.value as PresentationSettings["layout"] })}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              {PRESENTATION_LAYOUTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {settings.layout === "side" && (
            <NumberField
              label="Picture width"
              unit="%"
              step={1}
              value={settings.pictureShare}
              limits={l.pictureShare}
              onCommit={(pictureShare) => set({ pictureShare })}
              wide
            />
          )}
        </Group>

        <Group title="Colours">
          {PRESENTATION_COLOURS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-neutral-700">
              <span className="flex-1">{label}</span>
              <input
                type="color"
                value={settings.colours[key]}
                onChange={(e) => set({ colours: { ...settings.colours, [key]: e.target.value } })}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
              />
              <span className="w-16 text-xs text-neutral-400">{settings.colours[key]}</span>
            </label>
          ))}
        </Group>

        <Group title="Text">
          <FontChoice label="Title font" value={settings.titleFont} onChange={(titleFont) => set({ titleFont })} />
          <NumberField
            label="Title size"
            unit="pixels"
            step={1}
            value={settings.titleSize}
            limits={l.titleSize}
            onCommit={(titleSize) => set({ titleSize })}
            wide
          />
          <FontChoice label="Text font" value={settings.textFont} onChange={(textFont) => set({ textFont })} />
          <NumberField
            label="Text size"
            unit="pixels"
            step={1}
            value={settings.textSize}
            limits={l.textSize}
            onCommit={(textSize) => set({ textSize })}
            wide
          />
          <NumberField
            label="Line spacing"
            unit="× text size"
            step={0.1}
            value={settings.lineSpacing}
            limits={l.lineSpacing}
            onCommit={(lineSpacing) => set({ lineSpacing })}
            wide
          />
        </Group>

        <Group title="Shape">
          <NumberField
            label="Border"
            unit="pixels"
            step={1}
            value={settings.borderWidth}
            limits={l.borderWidth}
            onCommit={(borderWidth) => set({ borderWidth })}
            wide
          />
          <NumberField
            label="Corner rounding"
            unit="pixels"
            step={1}
            value={settings.rounding}
            limits={l.rounding}
            onCommit={(rounding) => set({ rounding })}
            wide
          />
          <NumberField
            label="Button rounding"
            unit="pixels"
            step={1}
            value={settings.buttonRounding}
            limits={l.buttonRounding}
            onCommit={(buttonRounding) => set({ buttonRounding })}
            wide
          />
        </Group>

        <Group title="Show">
          {PRESENTATION_PARTS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={settings.show[key]}
                onChange={(e) => set({ show: { ...settings.show, [key]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </Group>

        {(
          [
            ["details", "Wording"],
            ["enquiry", "Enquiry wording"],
            ["payment", "Payment wording"],
          ] as const
        ).map(([group, title]) => (
          <Group key={group} title={title}>
            {PRESENTATION_LABELS.filter((l) => l.group === group).map(({ key, label, hint }) => (
              <label key={key} className="flex flex-col gap-1 text-sm text-neutral-700">
                <span>{label}</span>
                <input
                  type="text"
                  value={settings.labels[key]}
                  maxLength={80}
                  onChange={(e) => set({ labels: { ...settings.labels, [key]: e.target.value } })}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
                {hint && <span className="text-xs text-neutral-400">{hint}</span>}
              </label>
            ))}
          </Group>
        ))}

        <p className="text-xs text-neutral-400">
          Chosen per Page Style (Templates → Page Styles → Presentation). Enquire opens the enquiry form; Purchase and
          Instalments open the payment form when the site takes payments (Settings → Take payments), otherwise they
          email the artist.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-3">
        <p className={`min-w-0 text-xs ${status.isError ? "text-red-600" : "text-neutral-500"}`}>{status.text}</p>
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

function FontChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SiteFontId;
  onChange: (value: SiteFontId) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="w-24 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SiteFontId)}
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
      >
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
    </label>
  );
}
