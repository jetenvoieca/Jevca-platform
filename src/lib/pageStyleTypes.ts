// The Style Types a Page Style can be built from (2026-10-04) — see
// PageType in schema.prisma. Canvas added 2026-10-05. Plain module, not
// "use server", so both the server actions and the editor can import it.
export const PAGE_STYLE_TYPES = [
  { value: "SECTION", label: "Section" },
  { value: "PRIVATE", label: "Private / Custom" },
  { value: "CANVAS", label: "Canvas" },
] as const;

export type PageStyleType = (typeof PAGE_STYLE_TYPES)[number]["value"];

export function isPageStyleType(value: string): value is PageStyleType {
  return PAGE_STYLE_TYPES.some((t) => t.value === value);
}

export function pageStyleTypeLabel(value: string): string {
  return PAGE_STYLE_TYPES.find((t) => t.value === value)?.label ?? value;
}
