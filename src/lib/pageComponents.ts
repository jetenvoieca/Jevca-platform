import type { CurationSectionType } from "@/lib/curationSections";
import type { LayoutBlockType } from "@/lib/pageStyleLayout";

// What fills a Block Build page's components (2026-10-07, from
// Craig's mockup) — set per page in the Pages page's Arrange, by
// dragging the page's curation's sections onto its Display Style's
// components. One per component; a component with nothing in it shows
// nothing. See PageComponentContent in schema.prisma. Plain module, not
// "use server", so the server actions, the Arrange view and the page
// share it.

// One component's content: `blockId` is the component in the page's
// Display Style; `sectionId` is one of the curation's sections, or null
// for the curation's works.
export type ComponentContent = { blockId: string; sectionId: string | null };

// What can go in a component: a section, by its type, or the works.
export type ContentKind = CurationSectionType | "WORKS";

const TEXT_KINDS: readonly ContentKind[] = ["TAGLINE", "DESCRIPTION", "TEXT"];

// Which content each component takes (Craig's choice, 2026-10-07: match
// by kind). Feature takes nothing yet.
const FITS: Record<LayoutBlockType, readonly ContentKind[]> = {
  header: TEXT_KINDS,
  text: TEXT_KINDS,
  textgrid: TEXT_KINDS,
  video: ["VIDEO"],
  image: ["IMAGES"],
  gallery: ["IMAGES", "WORKS"],
  slidingdoors: ["WORKS"],
  artwork: [],
};

export function contentFits(block: LayoutBlockType, kind: ContentKind): boolean {
  return FITS[block].includes(kind);
}
