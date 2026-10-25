"use client";

import type { ReactNode } from "react";
import {
  DEFAULT_HIGHLIGHT,
  DEFAULT_SOCIAL_TEXT,
  DEFAULT_TOP_BAR,
  MENU_BEHAVIOURS,
  MENU_KINDS,
  MENU_POSITIONS,
  MENU_SHADOWS,
  MENU_STYLE_LIMITS,
  SUB_PAGES_SHOW,
  normalizeMenuStyle,
  type MenuSideList,
  type MenuStyleLayout,
  type MenuTopBar,
} from "@/lib/menuStyleLayout";
import { DEFAULT_LINE, LINE_THICKNESS_LIMITS, LOGO_BYLINE_LIMITS, LOGO_HEIGHT_LIMITS } from "@/lib/pageStyleLayout";
import { SITE_FONTS, SITE_FONT_KINDS, isSiteFontId } from "@/lib/siteFonts";
import NumberField from "@/components/NumberField";
import { TextStyleBox } from "@/components/layoutControls";

// What's being edited: the menu's name and settings. Held by
// MenuStylesManager so its Preview shows every change straight away.
export type MenuStyleDraft = { name: string; layout: MenuStyleLayout };

// Templates → Menus' Add / Edit panel (2026-10-06): sits in the
// right-hand column, beside the Preview, and stays open until Close.
// Name, then Layout (kind, position or side, behaviour), a Side list's
// own settings (2026-10-23), the Top bar (2026-10-23), then Design
// (colours, the pages' look, highlight, rounding, shadow, blur) — see
// lib/menuStyleLayout.ts.
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
  const setList = (patch: Partial<MenuSideList>) => set({ list: { ...layout.list, ...patch } });
  const bar = layout.topBar;
  const setBar = (patch: Partial<MenuTopBar>) => bar && set({ topBar: { ...bar, ...patch } });
  const sideList = layout.kind === "sidelist";
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
          <Choice label="Type" value={layout.kind} choices={MENU_KINDS} onChange={(kind) => set({ kind })} />
          {sideList ? (
            <Choice label="Side" value={layout.list.side} choices={SIDES} onChange={(side) => setList({ side })} />
          ) : (
            <Choice
              label="Position"
              value={layout.position}
              choices={MENU_POSITIONS}
              onChange={(position) => set({ position })}
            />
          )}
          <Choice
            label="Behaviour"
            value={layout.behaviour}
            choices={MENU_BEHAVIOURS}
            onChange={(behaviour) => set({ behaviour })}
          />
        </Group>

        {sideList && (
          <Group title="Side list">
            <WholeNumber
              label="Width"
              unit="pixels"
              value={layout.list.width}
              limits={l.listWidth}
              onCommit={(width) => setList({ width })}
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={layout.list.line !== null}
                onChange={(e) => setList({ line: e.target.checked ? DEFAULT_LINE : null })}
              />
              <span className="flex-1">Line beside the list</span>
              {layout.list.line && (
                <input
                  type="color"
                  value={layout.list.line.colour}
                  onChange={(e) => setList({ line: { ...layout.list.line!, colour: e.target.value } })}
                  aria-label="Line colour"
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
                />
              )}
            </label>
            <WholeNumber
              label="Space above"
              unit="pixels"
              value={layout.list.top}
              limits={l.listTop}
              onCommit={(top) => setList({ top })}
            />
            <WholeNumber
              label="Space between pages"
              unit="pixels"
              value={layout.list.gap}
              limits={l.listGap}
              onCommit={(gap) => setList({ gap })}
            />
            <Choice
              label="Pages line up"
              value={layout.list.align}
              choices={ALIGNS}
              onChange={(align) => setList({ align })}
            />
            <WholeNumber
              label="Menu button below"
              unit="pixels wide"
              value={layout.list.hamburgerBelow}
              limits={l.hamburgerBelow}
              onCommit={(hamburgerBelow) => setList({ hamburgerBelow })}
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={layout.list.social !== null}
                onChange={(e) =>
                  setList({ social: e.target.checked ? { text: DEFAULT_SOCIAL_TEXT, capitals: true } : null })
                }
              />
              Instagram and Facebook under the list
            </label>
            {layout.list.social && (
              <>
                <TextStyleBox
                  label="Links"
                  value={layout.list.social.text}
                  fonts={SITE_FONTS}
                  kinds={SITE_FONT_KINDS}
                  isFont={isSiteFontId}
                  onChange={(text) => setList({ social: { ...layout.list.social!, text } })}
                />
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={layout.list.social.capitals}
                    onChange={(e) => setList({ social: { ...layout.list.social!, capitals: e.target.checked } })}
                  />
                  In capitals
                </label>
              </>
            )}
          </Group>
        )}

        <Group title="Pages under another">
          <Choice
            label="Show them"
            value={layout.sub.show}
            choices={SUB_PAGES_SHOW}
            onChange={(show) => set({ sub: { ...layout.sub, show } })}
          />
          <WholeNumber
            label="Indent"
            unit="pixels"
            value={layout.sub.indent}
            limits={l.subIndent}
            onCommit={(indent) => set({ sub: { ...layout.sub, indent } })}
          />
          <WholeNumber
            label="Space between them"
            unit="pixels"
            value={layout.sub.gap}
            limits={l.subGap}
            onCommit={(gap) => set({ sub: { ...layout.sub, gap } })}
          />
          <TextStyleBox
            label="Their look"
            value={layout.sub.text}
            fonts={SITE_FONTS}
            kinds={SITE_FONT_KINDS}
            isFont={isSiteFontId}
            onChange={(text) => set({ sub: { ...layout.sub, text } })}
          />
          <p className="text-xs text-neutral-400">
            A page is put under another in Pages → Edit. Anything left blank follows the pages&apos; look (a little
            smaller).
          </p>
        </Group>

        <Group title="Top bar">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={bar !== null}
              onChange={(e) => set({ topBar: e.target.checked ? DEFAULT_TOP_BAR : null })}
            />
            The logo in a bar across the top
          </label>
          {bar && (
            <>
              {(["desktop", "phone"] as const).map((device) => (
                <WholeNumber
                  key={`h-${device}`}
                  label={`Bar height, ${device}`}
                  unit="pixels"
                  value={bar.height[device]}
                  limits={l.barHeight}
                  onCommit={(v) => setBar({ height: { ...bar.height, [device]: v } })}
                />
              ))}
              {(["desktop", "phone"] as const).map((device) => (
                <WholeNumber
                  key={`p-${device}`}
                  label={`Space at the ends, ${device}`}
                  unit="pixels"
                  value={bar.padding[device]}
                  limits={l.barPadding}
                  onCommit={(v) => setBar({ padding: { ...bar.padding, [device]: v } })}
                />
              ))}
              {(["desktop", "phone"] as const).map((device) => (
                <WholeNumber
                  key={`l-${device}`}
                  label={`Logo height, ${device}`}
                  unit="pixels"
                  value={bar.logoHeight[device]}
                  limits={LOGO_HEIGHT_LIMITS}
                  onCommit={(v) => setBar({ logoHeight: { ...bar.logoHeight, [device]: v } })}
                />
              ))}
              <TextStyleBox
                label="Words under the logo"
                value={bar.byline.style}
                fonts={SITE_FONTS}
                kinds={SITE_FONT_KINDS}
                isFont={isSiteFontId}
                noSize
                onChange={(style) => setBar({ byline: { ...bar.byline, style } })}
              />
              {BYLINE_FIELDS.map((f) => (
                <WholeNumber
                  key={f.key}
                  label={f.label}
                  unit={f.unit}
                  value={bar.byline[f.key]}
                  limits={LOGO_BYLINE_LIMITS[f.key]}
                  onCommit={(v) => setBar({ byline: { ...bar.byline, [f.key]: v } })}
                />
              ))}
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={bar.line !== null}
                  onChange={(e) => setBar({ line: e.target.checked ? DEFAULT_LINE : null })}
                />
                <span className="flex-1">Line under the bar</span>
                {bar.line && (
                  <input
                    type="color"
                    value={bar.line.colour}
                    onChange={(e) => setBar({ line: { ...bar.line!, colour: e.target.value } })}
                    aria-label="Line colour"
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
                  />
                )}
              </label>
              {bar.line && (
                <NumberField
                  label="Line thickness"
                  unit="pixels"
                  step={0.5}
                  value={bar.line.thickness}
                  limits={LINE_THICKNESS_LIMITS}
                  onCommit={(thickness) => setBar({ line: { ...bar.line!, thickness } })}
                  wide
                />
              )}
              <p className="text-xs text-neutral-400">
                The logo and its words are typed in Settings → Personal Profile.
              </p>
            </>
          )}
        </Group>

        <Group title="Design">
          <ColourField
            label="Background"
            value={layout.backgroundColor}
            onChange={(backgroundColor) => set({ backgroundColor })}
          />
          <WholeNumber
            label="Background opacity"
            unit="%"
            value={layout.backgroundOpacity}
            limits={l.backgroundOpacity}
            onCommit={(backgroundOpacity) => set({ backgroundOpacity })}
          />
          <TextStyleBox
            label="Pages"
            value={layout.text}
            fonts={SITE_FONTS}
            kinds={SITE_FONT_KINDS}
            isFont={isSiteFontId}
            onChange={(text) => set({ text })}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={layout.highlightColor !== null}
              onChange={(e) => set({ highlightColor: e.target.checked ? DEFAULT_HIGHLIGHT : null })}
            />
            <span className="flex-1">Highlight the current page</span>
            {layout.highlightColor && (
              <input
                type="color"
                value={layout.highlightColor}
                onChange={(e) => set({ highlightColor: e.target.value })}
                aria-label="Highlight colour"
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
              />
            )}
          </label>
          <WholeNumber
            label="Corner rounding"
            unit="pixels"
            value={layout.rounding}
            limits={l.rounding}
            onCommit={(rounding) => set({ rounding })}
          />
          <Choice label="Shadow" value={layout.shadow} choices={MENU_SHADOWS} onChange={(shadow) => set({ shadow })} />
          <WholeNumber
            label="Background blur"
            unit="pixels"
            value={layout.blur}
            limits={l.blur}
            onCommit={(blur) => set({ blur })}
          />
        </Group>

        <p className="text-xs text-neutral-400">
          The menu lists each site&apos;s Live Pages, in order. On phones it always opens full screen.
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

const SIDES = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const;

const ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centred" },
  { value: "right", label: "Right" },
] as const;

// The words under the logo: size and place, all a share of the logo.
const BYLINE_FIELDS: { key: keyof typeof LOGO_BYLINE_LIMITS; label: string; unit: string }[] = [
  { key: "size", label: "Words' size", unit: "% of logo height" },
  { key: "up", label: "Words up", unit: "% of logo height" },
  { key: "across", label: "Words across", unit: "% of logo width" },
];

// A whole-number setting.
function WholeNumber({
  label,
  unit,
  value,
  limits,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  limits: { min: number; max: number };
  onCommit: (value: number) => void;
}) {
  return <NumberField label={label} unit={unit} step={1} value={value} limits={limits} onCommit={onCommit} wide />;
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

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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
