"use client";

import {
  DEFAULT_GALLERY_PER_ROW,
  DEFAULT_LOGO_HEIGHT,
  GALLERY_PER_ROW_LIMITS,
  GALLERY_SMALLEST_LIMITS,
  LAYOUT_BLOCK_TYPES,
  LOGO_HEIGHT_LIMITS,
  SLIDING_DOORS_LIMITS,
  DEFAULT_GALLERY_NAMES,
  DEFAULT_LINE,
  LINE_THICKNESS_LIMITS,
  cleanLine,
  DEFAULT_GALLERY_TILES,
  GALLERY_ROUNDING_LIMITS,
  cleanGalleryTiles,
  type GalleryTiles,
  DEFAULT_LOGO_BYLINE,
  cleanLogoByline,
  LOGO_BYLINE_LIMITS,
  HERO_LIMITS,
  PICTURE_WORDS_LIMITS,
  ENTRIES_LIMITS,
  PAGE_HEADING_LIMITS,
  cleanPageHeading,
  type PageHeadingSettings,
  cleanEntriesSettings,
  type EntriesSettings,
  cleanPictureWords,
  type PictureWordsSettings,
  PICTURE_SHAPES,
  cleanGalleryNames,
  cleanHero,
  type HeroSettings,
  type PageTextStyle,
  cleanGalleryPerRow,
  cleanLogoHeight,
  cleanSignupLook,
  cleanSlidingDoors,
  newLayoutBlock,
  pageDesignWidth,
  type BlockBuildLayout,
  type LayoutBlock,
  type SignupLook,
  type SlidingDoorsSettings,
} from "@/lib/pageStyleLayout";
import type { ReactNode } from "react";
import { BlockShape } from "@/components/blockShapes";
import type { PreviewDevice } from "@/components/pageRows";
import NumberField from "@/components/NumberField";
import { TextStyleBox } from "@/components/layoutControls";
import VisualLayoutEditor, { type TextStyleFonts } from "@/components/VisualLayoutEditor";
import { SITE_FONTS, SITE_FONT_KINDS, isSiteFontId } from "@/lib/siteFonts";

// The visual editor for a Block Build Page Style (2026-10-07; split out
// of VisualLayoutEditor 2026-10-08, which is now shared with Mail
// Templates): the page's components, drawn as outlines at a desktop's
// width, and a Sliding doors or Sign-up form (2026-10-10) component's
// own settings on its bar.
// A Header, Text or Text grid component's own Text style (2026-10-10),
// in the website fonts.
const SITE_TEXT_STYLE_FONTS: TextStyleFonts = {
  fonts: SITE_FONTS,
  kinds: SITE_FONT_KINDS,
  isFont: isSiteFontId,
  scales: true,
};

export default function PageStyleLayoutEditor({
  layout,
  onChange,
  renderBlock,
}: {
  layout: BlockBuildLayout;
  onChange: (layout: BlockBuildLayout) => void;
  // How a component is drawn instead of its outline (2026-10-22 — a
  // page's real content, see PageLayoutEditor); null = its outline.
  renderBlock?: (block: LayoutBlock, device: PreviewDevice) => ReactNode | null;
}) {
  return (
    <VisualLayoutEditor<LayoutBlock, BlockBuildLayout>
      layout={layout}
      onChange={onChange}
      components={LAYOUT_BLOCK_TYPES}
      newBlock={newLayoutBlock}
      renderBlock={(b, device) =>
        renderBlock?.(b, device) ?? (
          <BlockShape
            type={b.type}
            doors={b.doors}
            signup={b.signup}
            perRow={b.perRow}
            names={!!b.names}
            hero={b.hero}
            pictureWords={b.pictureWords}
            device={device}
            spacing={layout.gridSpacing}
          />
        )
      }
      settingsPanel={(b, onBlock) => {
        if (b.hero) {
          return {
            button: "Settings",
            title: "Hero",
            content: <HeroSettingsPanel hero={b.hero} onChange={(hero) => onBlock({ ...b, hero: cleanHero(hero) })} />,
          };
        }
        if (b.pageHeading) {
          const heading = b.pageHeading;
          const set = (patch: Partial<PageHeadingSettings>) =>
            onBlock({ ...b, pageHeading: cleanPageHeading({ ...heading, ...patch }) });
          return {
            button: "Settings",
            title: "Page heading",
            content: (
              <>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={heading.showPage}
                    onChange={(e) => set({ showPage: e.target.checked })}
                  />
                  Show the page&apos;s name under the site&apos;s
                </label>
                <TextStyleBox
                  label="Site name"
                  value={heading.name}
                  fonts={SITE_FONTS}
                  kinds={SITE_FONT_KINDS}
                  isFont={isSiteFontId}
                  scales
                  onChange={(name) => set({ name })}
                />
                <TextStyleBox
                  label="Page name"
                  value={heading.page}
                  fonts={SITE_FONTS}
                  kinds={SITE_FONT_KINDS}
                  isFont={isSiteFontId}
                  scales
                  onChange={(page) => set({ page })}
                />
                <NumberField
                  label="Space between"
                  unit="pixels"
                  step={1}
                  value={heading.gap}
                  limits={PAGE_HEADING_LIMITS.space}
                  onCommit={(gap) => set({ gap })}
                  wide
                />
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={heading.line !== null}
                    onChange={(e) => set({ line: e.target.checked ? DEFAULT_LINE : null })}
                  />
                  <span className="flex-1">Line under</span>
                  {heading.line && (
                    <input
                      type="color"
                      value={heading.line.colour}
                      onChange={(e) => set({ line: { ...heading.line!, colour: e.target.value } })}
                      aria-label="Line colour"
                      className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
                    />
                  )}
                </label>
                {heading.line && (
                  <NumberField
                    label="Space above the line"
                    unit="pixels"
                    step={1}
                    value={heading.lineSpace}
                    limits={PAGE_HEADING_LIMITS.space}
                    onCommit={(lineSpace) => set({ lineSpace })}
                    wide
                  />
                )}
                <p className="text-xs text-neutral-400">
                  Fills itself in: the site&apos;s name, then the page&apos;s name with the page it sits under in front
                  (&ldquo;Portfolio: Head Sculptures&rdquo;). Either line can be typed over on a page in Arrange.
                </p>
              </>
            ),
          };
        }
        if (b.entries) {
          return {
            button: "Settings",
            title: "Entries",
            content: (
              <EntriesPanel
                settings={b.entries}
                onChange={(entries) => onBlock({ ...b, entries: cleanEntriesSettings(entries) })}
              />
            ),
          };
        }
        if (b.pictureWords) {
          return {
            button: "Settings",
            title: "Picture & words",
            content: (
              <PictureWordsPanel
                settings={b.pictureWords}
                onChange={(pictureWords) => onBlock({ ...b, pictureWords: cleanPictureWords(pictureWords) })}
              />
            ),
          };
        }
        if (b.type === "logo") {
          const byline = b.byline ?? DEFAULT_LOGO_BYLINE;
          return {
            button: "Byline",
            title: "Words under the logo",
            content: (
              <>
                <TextStyleBox
                  label="Look"
                  value={byline.style}
                  fonts={SITE_FONTS}
                  kinds={SITE_FONT_KINDS}
                  isFont={isSiteFontId}
                  noSize
                  onChange={(style) => onBlock({ ...b, byline: cleanLogoByline({ ...byline, style }) })}
                />
                {LOGO_BYLINE_FIELDS.map((f) => (
                  <NumberField
                    key={f.key}
                    label={f.label}
                    unit={f.unit}
                    step={1}
                    value={byline[f.key]}
                    limits={LOGO_BYLINE_LIMITS[f.key]}
                    onCommit={(value) => onBlock({ ...b, byline: cleanLogoByline({ ...byline, [f.key]: value }) })}
                    wide
                  />
                ))}
                <p className="text-xs text-neutral-400">
                  The words are typed once per artist, in Settings → Personal Profile.
                </p>
              </>
            ),
          };
        }
        if (b.type === "line") {
          const line = b.line ?? DEFAULT_LINE;
          return {
            button: "Settings",
            title: "Line",
            content: (
              <>
                <ColourRow
                  label="Colour"
                  value={line.colour}
                  onChange={(colour) => onBlock({ ...b, line: cleanLine({ ...line, colour }) })}
                />
                <NumberField
                  label="Thickness"
                  unit="pixels"
                  step={0.5}
                  value={line.thickness}
                  limits={LINE_THICKNESS_LIMITS}
                  onCommit={(thickness) => onBlock({ ...b, line: cleanLine({ ...line, thickness }) })}
                  wide
                />
              </>
            ),
          };
        }
        if (b.type === "gallery") {
          return {
            button: "Settings",
            title: "Gallery",
            content: (
              <GallerySettingsPanel
                names={b.names ?? null}
                tiles={b.tiles ?? DEFAULT_GALLERY_TILES}
                onNames={(names) => onBlock({ ...b, names: cleanGalleryNames(names) })}
                onTiles={(tiles) => onBlock({ ...b, tiles: cleanGalleryTiles(tiles) })}
              />
            ),
          };
        }
        if (b.doors) {
          return {
            button: "Settings",
            title: "Sliding doors",
            content: (
              <DoorsSettings doors={b.doors} onChange={(doors) => onBlock({ ...b, doors: cleanSlidingDoors(doors) })} />
            ),
          };
        }
        if (b.signup) {
          return {
            button: "Settings",
            title: "Sign-up form",
            content: (
              <SignupSettings
                look={b.signup}
                onChange={(signup) => onBlock({ ...b, signup: cleanSignupLook(signup) })}
              />
            ),
          };
        }
        return null;
      }}
      fineTune={(b, onBlock) => {
        if (b.type === "logo") {
          const height = b.logoHeight ?? DEFAULT_LOGO_HEIGHT;
          return (["desktop", "phone"] as const).map((device) => ({
            label: `Height, ${device}`,
            unit: "pixels",
            value: height[device],
            limits: LOGO_HEIGHT_LIMITS,
            onCommit: (value: number) => onBlock({ ...b, logoHeight: cleanLogoHeight({ ...height, [device]: value }) }),
          }));
        }
        if (b.type !== "gallery") return null;
        const perRow = b.perRow ?? DEFAULT_GALLERY_PER_ROW;
        const save = (patch: Partial<typeof perRow>) =>
          onBlock({ ...b, perRow: cleanGalleryPerRow({ ...perRow, ...patch }) });
        return [
          ...(["desktop", "phone"] as const).map((device) => ({
            label: `Images per row, ${device}`,
            unit: "",
            value: perRow[device],
            limits: GALLERY_PER_ROW_LIMITS,
            onCommit: (value: number) => save({ [device]: value }),
          })),
          {
            label: "Smallest image, in between",
            unit: "pixels",
            value: perRow.smallest,
            limits: GALLERY_SMALLEST_LIMITS,
            onCommit: (value: number) => save({ smallest: value }),
          },
        ];
      }}
      textStyleFonts={SITE_TEXT_STYLE_FONTS}
      desktopWidth={pageDesignWidth(layout)}
      backgroundColor={layout.backgroundColor}
      phoneBackgroundColor={layout.phoneBackgroundColor}
      backgroundImage={layout.backgroundImage}
    />
  );
}

// Where the words under a Logo sit and how big they are, all scaling
// with the logo (2026-10-22).
const LOGO_BYLINE_FIELDS: { key: keyof typeof LOGO_BYLINE_LIMITS; label: string; unit: string }[] = [
  { key: "size", label: "Size", unit: "% of logo height" },
  { key: "up", label: "Up", unit: "% of logo height" },
  { key: "across", label: "Across", unit: "% of logo width" },
];

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

// A Sign-up form component's settings (2026-10-10): its button's colour
// and the colour of the button's text. Its words use the style's Text
// look; the list and the wording are set on each page, in Arrange.
function SignupSettings({ look, onChange }: { look: SignupLook; onChange: (look: SignupLook) => void }) {
  return (
    <>
      <ColourRow
        label="Button colour"
        value={look.buttonColour}
        onChange={(buttonColour) => onChange({ ...look, buttonColour })}
      />
      <ColourRow
        label="Button text colour"
        value={look.buttonTextColour}
        onChange={(buttonTextColour) => onChange({ ...look, buttonTextColour })}
      />
      <p className="text-xs text-neutral-500">
        The form&apos;s words use this style&apos;s Text look. The list and the wording are set on each page, in
        Arrange.
      </p>
    </>
  );
}

function ColourRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="flex-1">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
      />
      <span className="w-16 text-xs text-neutral-400">{value}</span>
    </label>
  );
}

// A Hero's settings (2026-10-22): how long each picture shows and how
// long it takes to fade to the next, the picture's share of the width,
// the gap beside it, the picture box's shape and whether the picture
// comes first on a phone, and the look of each line.
const HERO_NUMBERS: {
  label: string;
  unit: string;
  step: number;
  get: (h: HeroSettings) => number;
  set: (h: HeroSettings, v: number) => HeroSettings;
  limits: { min: number; max: number };
}[] = [
  {
    label: "Each picture",
    unit: "seconds",
    step: 0.5,
    get: (h) => h.seconds,
    set: (h, v) => ({ ...h, seconds: v }),
    limits: HERO_LIMITS.seconds,
  },
  {
    label: "Fade",
    unit: "seconds",
    step: 0.1,
    get: (h) => h.fade,
    set: (h, v) => ({ ...h, fade: v }),
    limits: HERO_LIMITS.fade,
  },
  {
    label: "Picture width",
    unit: "%",
    step: 1,
    get: (h) => h.pictureShare,
    set: (h, v) => ({ ...h, pictureShare: v }),
    limits: HERO_LIMITS.pictureShare,
  },
  {
    label: "Gap, desktop",
    unit: "pixels",
    step: 1,
    get: (h) => h.gap.desktop,
    set: (h, v) => ({ ...h, gap: { ...h.gap, desktop: v } }),
    limits: HERO_LIMITS.gap,
  },
  {
    label: "Gap, phone",
    unit: "pixels",
    step: 1,
    get: (h) => h.gap.phone,
    set: (h, v) => ({ ...h, gap: { ...h.gap, phone: v } }),
    limits: HERO_LIMITS.gap,
  },
];

function HeroSettingsPanel({ hero, onChange }: { hero: HeroSettings; onChange: (hero: HeroSettings) => void }) {
  const look = (key: "kicker" | "headline" | "accent" | "below", label: string) => (
    <TextStyleBox
      label={label}
      value={hero[key]}
      fonts={SITE_FONTS}
      kinds={SITE_FONT_KINDS}
      isFont={isSiteFontId}
      scales
      onChange={(style) => onChange({ ...hero, [key]: style })}
    />
  );
  const shape = (device: "desktop" | "phone") => (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="flex-1">Picture shape, {device}</span>
      <select
        value={hero.shape[device]}
        onChange={(e) => onChange(cleanHero({ ...hero, shape: { ...hero.shape, [device]: e.target.value } }))}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
      >
        {PICTURE_SHAPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {HERO_NUMBERS.map((f) => (
        <NumberField
          key={f.label}
          label={f.label}
          unit={f.unit}
          step={f.step}
          value={f.get(hero)}
          limits={f.limits}
          onCommit={(value) => onChange(f.set(hero, value))}
          wide
        />
      ))}
      {shape("desktop")}
      {shape("phone")}
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={hero.pictureFirstOnPhone}
          onChange={(e) => onChange({ ...hero, pictureFirstOnPhone: e.target.checked })}
        />
        Picture first on a phone
      </label>
      {look("kicker", "Small line (in capitals)")}
      {look("headline", "Headline")}
      {look("accent", "Headline, second line")}
      {look("below", "Line under")}
      <p className="text-xs text-neutral-400">
        The words are typed on each page (Pages → Arrange); the pictures are the page&apos;s curation&apos;s works, each
        shown whole in its box.
      </p>
    </>
  );
}

// An Entries list's settings (2026-10-24): the pictures' width and
// shape, the spaces, the line between entries, and the looks of the
// date, title, caption and description.
function EntriesPanel({
  settings,
  onChange,
}: {
  settings: EntriesSettings;
  onChange: (settings: EntriesSettings) => void;
}) {
  const space = ENTRIES_LIMITS.space;
  const numbers: { key: "pictureWidth" | "gap" | "pictureSpace" | "titleSpace" | "entrySpace"; label: string }[] = [
    { key: "pictureWidth", label: "Picture width" },
    { key: "gap", label: "Space beside the picture" },
    { key: "pictureSpace", label: "Space between pictures" },
    { key: "titleSpace", label: "Space under the title" },
    { key: "entrySpace", label: "Space above and below the line" },
  ];
  const look = (key: "date" | "title" | "caption" | "text", label: string) => (
    <TextStyleBox
      label={label}
      value={settings[key]}
      fonts={SITE_FONTS}
      kinds={SITE_FONT_KINDS}
      isFont={isSiteFontId}
      scales
      onChange={(style) => onChange({ ...settings, [key]: style })}
    />
  );
  return (
    <>
      {numbers.map((f) => (
        <NumberField
          key={f.key}
          label={f.label}
          unit="pixels"
          step={1}
          value={settings[f.key]}
          limits={f.key === "pictureWidth" ? ENTRIES_LIMITS.pictureWidth : space}
          onCommit={(value) => onChange({ ...settings, [f.key]: value })}
          wide
        />
      ))}
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="flex-1">Picture shape</span>
        <select
          value={settings.shape}
          onChange={(e) => onChange(cleanEntriesSettings({ ...settings, shape: e.target.value }))}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          {PICTURE_SHAPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={settings.line !== null}
          onChange={(e) => onChange({ ...settings, line: e.target.checked ? DEFAULT_LINE : null })}
        />
        <span className="flex-1">Line between entries</span>
        {settings.line && (
          <input
            type="color"
            value={settings.line.colour}
            onChange={(e) => onChange({ ...settings, line: { ...settings.line!, colour: e.target.value } })}
            aria-label="Line colour"
            className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
          />
        )}
      </label>
      {look("date", "Date (in capitals)")}
      {look("title", "Title")}
      {look("caption", "Caption")}
      {look("text", "Description")}
      <p className="text-xs text-neutral-400">
        The entries are typed on each page (Pages → Arrange); their pictures are the curation&apos;s Supporting Images.
        On a phone each picture sits above its description, the full width.
      </p>
    </>
  );
}

// A Picture & words's settings (2026-10-24): the picture's side, share of
// the width and shape, the gap beside it, whether it comes first on a
// phone, where the words sit and the space under the headline, and the
// look of the headline, its second line and the Description.
function PictureWordsPanel({
  settings,
  onChange,
}: {
  settings: PictureWordsSettings;
  onChange: (settings: PictureWordsSettings) => void;
}) {
  const l = PICTURE_WORDS_LIMITS;
  const select = (
    label: string,
    value: string,
    options: readonly { value: string; label: string }[],
    set: (v: string) => void,
  ) => (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="flex-1">{label}</span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const number = (
    label: string,
    unit: string,
    value: number,
    limits: { min: number; max: number },
    set: (v: number) => void,
  ) => <NumberField label={label} unit={unit} step={1} value={value} limits={limits} onCommit={set} wide />;
  const look = (key: "headline" | "accent" | "body", label: string) => (
    <TextStyleBox
      label={label}
      value={settings[key]}
      fonts={SITE_FONTS}
      kinds={SITE_FONT_KINDS}
      isFont={isSiteFontId}
      scales
      onChange={(style) => onChange({ ...settings, [key]: style })}
    />
  );
  const sides = [
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ] as const;
  const wordsAt = [
    { value: "top", label: "Top" },
    { value: "middle", label: "Middle" },
  ] as const;
  return (
    <>
      {select("Picture on the", settings.side, sides, (side) => onChange(cleanPictureWords({ ...settings, side })))}
      {number("Picture width", "%", settings.pictureShare, l.pictureShare, (pictureShare) =>
        onChange({ ...settings, pictureShare }),
      )}
      {(["desktop", "phone"] as const).map((device) => (
        <div key={device} className="flex flex-col gap-2">
          {number(`Gap, ${device}`, "pixels", settings.gap[device], l.gap, (v) =>
            onChange({ ...settings, gap: { ...settings.gap, [device]: v } }),
          )}
          {select(`Picture shape, ${device}`, settings.shape[device], PICTURE_SHAPES, (v) =>
            onChange(cleanPictureWords({ ...settings, shape: { ...settings.shape, [device]: v } })),
          )}
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={settings.pictureFirstOnPhone}
          onChange={(e) => onChange({ ...settings, pictureFirstOnPhone: e.target.checked })}
        />
        Picture first on a phone
      </label>
      {select("Words sit at the", settings.wordsAt, wordsAt, (v) =>
        onChange(cleanPictureWords({ ...settings, wordsAt: v })),
      )}
      {number("Space under the headline", "pixels", settings.headlineSpace, l.headlineSpace, (headlineSpace) =>
        onChange({ ...settings, headlineSpace }),
      )}
      {look("headline", "Headline")}
      {look("accent", "Headline, second line")}
      {look("body", "Description")}
      <p className="text-xs text-neutral-400">
        The headline is typed on each page (Pages → Arrange); the picture is the first of the Supporting Images or works
        dragged onto it; the words under it are the curation&apos;s Description.
      </p>
    </>
  );
}

// A Gallery's settings (2026-10-22): its works' names under them, on or
// off, their look and whether they stay on one line; the hover zoom and
// veil with the price; the outline round the work showing in the page's
// Hero; and the pictures' rounded corners.
function GallerySettingsPanel({
  names,
  tiles,
  onNames,
  onTiles,
}: {
  names: PageTextStyle | null;
  tiles: GalleryTiles;
  onNames: (names: PageTextStyle | null) => void;
  onTiles: (tiles: GalleryTiles) => void;
}) {
  const tick = (key: "oneLineNames" | "zoom" | "veil", label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={tiles[key]} onChange={(e) => onTiles({ ...tiles, [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={names !== null}
          onChange={(e) => onNames(e.target.checked ? DEFAULT_GALLERY_NAMES : null)}
        />
        Show each work&apos;s name under it
      </label>
      {names && (
        <>
          <TextStyleBox
            label="Names"
            value={names}
            fonts={SITE_FONTS}
            kinds={SITE_FONT_KINDS}
            isFont={isSiteFontId}
            scales
            onChange={onNames}
          />
          {tick("oneLineNames", "Names on one line, cut with … when too long")}
        </>
      )}
      <NumberField
        label="Rounded corners"
        unit="pixels"
        step={1}
        value={tiles.rounding}
        limits={GALLERY_ROUNDING_LIMITS}
        onCommit={(rounding) => onTiles({ ...tiles, rounding })}
        wide
      />
      {tick("zoom", "On hover: the picture zooms a little")}
      {tick("veil", "On hover: a dark veil with the price")}
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={tiles.heroOutline !== null}
          onChange={(e) => onTiles({ ...tiles, heroOutline: e.target.checked ? "#e8698a" : null })}
        />
        <span className="flex-1">Outline the work showing in the Hero</span>
        {tiles.heroOutline !== null && (
          <input
            type="color"
            value={tiles.heroOutline}
            onChange={(e) => onTiles({ ...tiles, heroOutline: e.target.value })}
            aria-label="Outline colour"
            className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
          />
        )}
      </label>
    </>
  );
}
