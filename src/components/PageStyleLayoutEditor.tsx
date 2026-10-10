"use client";

import {
  LAYOUT_BLOCK_TYPES,
  SLIDING_DOORS_LIMITS,
  cleanSlidingDoors,
  newLayoutBlock,
  type BlockBuildLayout,
  type LayoutBlock,
  type SlidingDoorsSettings,
} from "@/lib/pageStyleLayout";
import { BlockShape } from "@/components/blockShapes";
import NumberField from "@/components/NumberField";
import VisualLayoutEditor, { type TextStyleFonts } from "@/components/VisualLayoutEditor";
import { SITE_FONTS, SITE_FONT_KINDS, isSiteFontId } from "@/lib/siteFonts";
import { PAGE_DESKTOP_WIDTH } from "@/components/visualEditorParts";

// The visual editor for a Block Build Page Style (2026-10-07; split out
// of VisualLayoutEditor 2026-10-08, which is now shared with Mail
// Templates): the page's components, drawn as outlines at a desktop's
// width, and a Sliding doors component's own settings on its bar.
// A Header, Text or Text grid component's own Text style (2026-10-10),
// in the website fonts.
const SITE_TEXT_STYLE_FONTS: TextStyleFonts = { fonts: SITE_FONTS, kinds: SITE_FONT_KINDS, isFont: isSiteFontId };

export default function PageStyleLayoutEditor({
  layout,
  onChange,
}: {
  layout: BlockBuildLayout;
  onChange: (layout: BlockBuildLayout) => void;
}) {
  return (
    <VisualLayoutEditor<LayoutBlock, BlockBuildLayout>
      layout={layout}
      onChange={onChange}
      components={LAYOUT_BLOCK_TYPES}
      newBlock={newLayoutBlock}
      renderBlock={(b) => <BlockShape type={b.type} doors={b.doors} spacing={layout.gridSpacing} />}
      settingsPanel={(b, onBlock) =>
        b.doors
          ? {
              button: "Settings",
              title: "Sliding doors",
              content: (
                <DoorsSettings
                  doors={b.doors}
                  onChange={(doors) => onBlock({ ...b, doors: cleanSlidingDoors(doors) })}
                />
              ),
            }
          : null
      }
      textStyleFonts={SITE_TEXT_STYLE_FONTS}
      desktopWidth={PAGE_DESKTOP_WIDTH}
      backgroundColor={layout.backgroundColor}
      backgroundImage={layout.backgroundImage}
    />
  );
}

// The Sliding doors number settings, in order. Gap only applies to pairs.
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

// A Sliding doors component's settings (2026-10-05; on the component
// itself from 2026-10-07): pairs or one at a time, how long each slide
// shows, how fast it moves, the gap between a pair, and the square
// panels' height on desktop and phone.
function DoorsSettings({
  doors,
  onChange,
}: {
  doors: SlidingDoorsSettings;
  onChange: (doors: SlidingDoorsSettings) => void;
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="flex-1">Show</span>
        <select
          value={doors.perSlide}
          onChange={(e) => onChange({ ...doors, perSlide: e.target.value === "1" ? 1 : 2 })}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value={2}>Pairs</option>
          <option value={1}>One at a time</option>
        </select>
      </label>
      {DOORS_FIELDS.filter((f) => f.key !== "gap" || doors.perSlide === 2).map((f) => (
        <NumberField
          key={f.key}
          label={f.label}
          unit={f.unit}
          step={f.step}
          value={doors[f.key]}
          limits={SLIDING_DOORS_LIMITS[f.key]}
          onCommit={(value) => onChange({ ...doors, [f.key]: value })}
          wide
        />
      ))}
      <NumberField
        label="Height, desktop"
        unit="% of screen"
        step={5}
        value={doors.height.desktop}
        limits={SLIDING_DOORS_LIMITS.height}
        onCommit={(desktop) => onChange({ ...doors, height: { ...doors.height, desktop } })}
        wide
      />
      <NumberField
        label="Height, phone"
        unit="% of screen"
        step={5}
        value={doors.height.phone}
        limits={SLIDING_DOORS_LIMITS.height}
        onCommit={(phone) => onChange({ ...doors, height: { ...doors.height, phone } })}
        wide
      />
    </>
  );
}
