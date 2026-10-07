// The Style Types a Page Style can be built from (2026-10-04) — see
// PageType in schema.prisma. Each is a fundamentally different way of
// building a page, not a different look:
// - Block Build (2026-10-07, was "Private / Custom"): a page built from
//   components, each filled from the page's curation in Arrange.
// - Canvas (2026-10-05): the curations placed on a canvas that scrolls
//   in any direction.
// Section was removed 2026-10-07 — anything it did is built from
// components now. Plain module, not "use server", so both the server
// actions and the editor can import it.
export const PAGE_STYLE_TYPES = [
  { value: "PRIVATE", label: "Block Build" },
  { value: "CANVAS", label: "Canvas" },
] as const;

export type PageStyleType = (typeof PAGE_STYLE_TYPES)[number]["value"];

export function isPageStyleType(value: string): value is PageStyleType {
  return PAGE_STYLE_TYPES.some((t) => t.value === value);
}

export function pageStyleTypeLabel(value: string): string {
  return PAGE_STYLE_TYPES.find((t) => t.value === value)?.label ?? value;
}
