import { cleanColour, cleanNumber } from "@/lib/rowLayout";
import { isSiteFontId, type SiteFontId } from "@/lib/siteFonts";

// A Dynamic presentation (2026-11-03, Craig's mockup — phase one, mainly
// for Canvas pages): a curation's own scrolling presentation, opened in
// place of the usual curation panel when one of its works is clicked on a
// Canvas page. One or more sections, one under another, each its own
// shape (`height`, a % of its width) with a background colour and,
// optionally, a picture or short looping video from the Media Catalogue
// over it; on each, the curation's works, Media Catalogue pictures and
// text, each placed by hand. Positions and sizes are % of the section, so
// it all scales together with the width (phones too). Phase two
// (2026-11-03, from Craig's British High Street site): each item can make
// an entrance as its section scrolls into view — fading, sliding in from
// a side or growing, after a delay, so they arrive one after another —
// and sit in a frame: a card (white, rounded, soft shadow) or with a
// corner cut off. Kept as JSON on
// the curation (Curation.dynamicPresentation). Plain module, shared by
// the editor, the actions and the site.

export const DYNAMIC_ENTRANCES = [
  { value: "none", label: "None — always there" },
  { value: "fade", label: "Fade in" },
  { value: "up", label: "Slide up" },
  { value: "down", label: "Slide down" },
  { value: "left", label: "Slide in from the right" },
  { value: "right", label: "Slide in from the left" },
  { value: "grow", label: "Grow" },
] as const;
export type DynamicEntrance = (typeof DYNAMIC_ENTRANCES)[number]["value"];

export const DYNAMIC_FRAMES = [
  { value: "none", label: "None" },
  { value: "card", label: "Card" },
  { value: "cut", label: "Cut corner" },
] as const;
export type DynamicFrame = (typeof DYNAMIC_FRAMES)[number]["value"];

export type DynamicItem = {
  id: string;
  kind: "work" | "media" | "text";
  // A work of the curation (its main picture), or a Media Catalogue picture.
  artworkId: string | null;
  imageId: string | null;
  // A text's words and look; `size` is a % of the section's width.
  text: string;
  font: SiteFontId;
  size: number;
  colour: string;
  bold: boolean;
  // Its left and top edges (% of the section's width and height) and its
  // width (% of the section's width); a picture's height follows its shape.
  x: number;
  y: number;
  w: number;
  // Its entrance, after `delay` seconds, taking `duration` seconds.
  entrance: DynamicEntrance;
  delay: number;
  duration: number;
  frame: DynamicFrame;
};

export type DynamicSection = {
  id: string;
  height: number;
  colour: string;
  // A picture or video from the Media Catalogue over the colour.
  backgroundImageId: string | null;
  items: DynamicItem[];
};

export type DynamicPresentation = { sections: DynamicSection[] };

// The Media Catalogue pictures and videos it uses, by id — for drawing it.
export type DynamicMedia = Record<string, { kind: "PHOTO" | "VIDEO"; url: string; posterUrl: string | null }>;

export const DYNAMIC_LIMITS = {
  sections: 30,
  items: 60,
  height: { min: 20, max: 300 },
  position: { min: -50, max: 150 },
  width: { min: 3, max: 100 },
  size: { min: 0.5, max: 20 },
  text: 2000,
  delay: { min: 0, max: 10 },
  duration: { min: 0.2, max: 5 },
} as const;

export const NEW_SECTION_HEIGHT = 56;

const idOf = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 100) : null);

function cleanItem(raw: unknown): DynamicItem | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  const id = idOf(v.id);
  const kind = v.kind === "work" || v.kind === "media" || v.kind === "text" ? v.kind : null;
  if (!id || !kind) return null;
  const artworkId = kind === "work" ? idOf(v.artworkId) : null;
  const imageId = kind === "media" ? idOf(v.imageId) : null;
  if ((kind === "work" && !artworkId) || (kind === "media" && !imageId)) return null;
  const l = DYNAMIC_LIMITS;
  return {
    id,
    kind,
    artworkId,
    imageId,
    text: kind === "text" && typeof v.text === "string" ? v.text.slice(0, l.text) : "",
    font: isSiteFontId(v.font) ? v.font : "gelasio",
    size: cleanNumber(v.size, l.size, 3, 1),
    colour: cleanColour(v.colour) ?? "#222222",
    bold: v.bold === true,
    x: cleanNumber(v.x, l.position, 10, 1),
    y: cleanNumber(v.y, l.position, 10, 1),
    w: cleanNumber(v.w, l.width, 25, 1),
    entrance: DYNAMIC_ENTRANCES.find((e) => e.value === v.entrance)?.value ?? "none",
    delay: cleanNumber(v.delay, l.delay, 0, 1),
    duration: cleanNumber(v.duration, l.duration, 0.8, 1),
    frame: DYNAMIC_FRAMES.find((f) => f.value === v.frame)?.value ?? "none",
  };
}

function cleanSection(raw: unknown): DynamicSection | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  const id = idOf(v.id);
  if (!id) return null;
  const items = Array.isArray(v.items)
    ? v.items.slice(0, DYNAMIC_LIMITS.items).flatMap((i) => cleanItem(i) ?? [])
    : [];
  return {
    id,
    height: cleanNumber(v.height, DYNAMIC_LIMITS.height, NEW_SECTION_HEIGHT, 0),
    colour: cleanColour(v.colour) ?? "#ffffff",
    backgroundImageId: idOf(v.backgroundImageId),
    items,
  };
}

// Whatever is stored (or sent), as a valid presentation; null when it has
// no sections (the curation then opens its usual panel).
export function cleanDynamicPresentation(raw: unknown): DynamicPresentation | null {
  const v = (raw ?? {}) as { sections?: unknown };
  const sections = Array.isArray(v.sections)
    ? v.sections.slice(0, DYNAMIC_LIMITS.sections).flatMap((s) => cleanSection(s) ?? [])
    : [];
  return sections.length ? { sections } : null;
}

// Every Media Catalogue picture or video it uses.
export function dynamicImageIds(p: DynamicPresentation): string[] {
  const ids = new Set<string>();
  for (const s of p.sections) {
    if (s.backgroundImageId) ids.add(s.backgroundImageId);
    for (const i of s.items) if (i.imageId) ids.add(i.imageId);
  }
  return [...ids];
}
