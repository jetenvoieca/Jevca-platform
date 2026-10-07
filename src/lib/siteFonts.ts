// The fonts a Page Style's text components can use (2026-10-07, Craig's
// choice: a set list, the same on every site). Plain module — the names
// only, shared by the layout rules and the editor. The font files
// themselves are in lib/siteFontFaces.ts. Adding one means adding it
// here and there.

export const SITE_FONT_KINDS = ["Sans serif", "Serif", "Monospace"] as const;

export const SITE_FONTS = [
  { id: "dm-sans", label: "DM Sans", kind: "Sans serif" },
  { id: "lato", label: "Lato", kind: "Sans serif" },
  { id: "montserrat", label: "Montserrat", kind: "Sans serif" },
  { id: "raleway", label: "Raleway", kind: "Sans serif" },
  { id: "source-sans-3", label: "Source Sans 3", kind: "Sans serif" },
  { id: "work-sans", label: "Work Sans", kind: "Sans serif" },
  { id: "cormorant-garamond", label: "Cormorant Garamond", kind: "Serif" },
  { id: "eb-garamond", label: "EB Garamond", kind: "Serif" },
  { id: "libre-baskerville", label: "Libre Baskerville", kind: "Serif" },
  { id: "lora", label: "Lora", kind: "Serif" },
  { id: "playfair-display", label: "Playfair Display", kind: "Serif" },
  { id: "space-mono", label: "Space Mono", kind: "Monospace" },
] as const;

export type SiteFontId = (typeof SITE_FONTS)[number]["id"];

export function isSiteFontId(value: unknown): value is SiteFontId {
  return SITE_FONTS.some((f) => f.id === value);
}
