// The Style Types a Page Style can be built from (2026-10-04) — two of
// the old page types (see PageType in schema.prisma). Plain module, not
// "use server", so both the server actions and the modal can import it.
export const PAGE_STYLE_TYPES = [
  { value: "SECTION", label: "Section" },
  { value: "PRIVATE", label: "Private / Custom" },
] as const;

export type PageStyleType = (typeof PAGE_STYLE_TYPES)[number]["value"];

export function isPageStyleType(value: string): value is PageStyleType {
  return PAGE_STYLE_TYPES.some((t) => t.value === value);
}

export function pageStyleTypeLabel(value: string): string {
  return PAGE_STYLE_TYPES.find((t) => t.value === value)?.label ?? value;
}
