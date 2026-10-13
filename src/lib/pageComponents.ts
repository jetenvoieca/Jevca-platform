import type { CurationSectionType } from "@/lib/curationSections";
import type { LayoutBlockType } from "@/lib/pageStyleLayout";

// What fills a Block Build page's components (2026-10-07; 2026-10-13,
// Craig's mockup: Page Styles set the layout, curations the content, and
// a page brings them together) — set per page in the Pages page's
// Arrange. One per component; a component with nothing in it shows
// nothing. See PageComponentContent in schema.prisma. Plain module, not
// "use server", so the server actions, the Arrange view and the page
// share it.

// One component's content. `blockId` is the component in the page's
// Display Style. `source`:
// - WORKS: the curation's works.
// - SECTION: the curation's section `sectionId`; for a Description,
//   `text` is this page's own copy (null = the curation's).
// - TYPED: `text`, typed on the page (a Header).
// `hiddenIds` / `orderIds`: works or Supporting Images removed on this
// page, and the order chosen — see arrangeItems.
export type ComponentContent = {
  blockId: string;
  source: "WORKS" | "SECTION" | "TYPED";
  sectionId: string | null;
  text: string | null;
  hiddenIds: string[];
  orderIds: string[];
};

// What can go in a component: a section, by its type, the works, or
// typed text.
export type ContentKind = CurationSectionType | "WORKS" | "TYPED";

// Which content each component takes (Craig's choice: match by kind;
// 2026-10-13: a Header is typed in, a Text or Text grid takes the
// Description). Feature takes nothing yet. A Sign-up form (2026-10-10)
// takes no content: it's set up on its own in Arrange (see
// lib/signupForms.ts). A Logo (2026-10-13) is always the artist's own.
const FITS: Record<LayoutBlockType, readonly ContentKind[]> = {
  header: ["TYPED"],
  text: ["DESCRIPTION"],
  textgrid: ["DESCRIPTION"],
  video: ["VIDEO"],
  image: ["IMAGES"],
  gallery: ["IMAGES", "WORKS"],
  slidingdoors: ["WORKS"],
  artwork: [],
  signup: [],
  logo: [],
};

export function contentFits(block: LayoutBlockType, kind: ContentKind): boolean {
  return FITS[block].includes(kind);
}

// Whether a component is typed into rather than filled by dragging.
export function isTypedBlock(block: LayoutBlockType): boolean {
  return contentFits(block, "TYPED");
}

// What a component's content is, given the curation's section types by
// id — null if its section is no longer in the curation.
export function contentKindOf(
  content: ComponentContent,
  sectionTypes: Map<string, CurationSectionType>
): ContentKind | null {
  if (content.source === "WORKS") return "WORKS";
  if (content.source === "TYPED") return "TYPED";
  return (content.sectionId && sectionTypes.get(content.sectionId)) || null;
}

// Works or Supporting Images as one page shows them: those removed on the
// page left out; those in the chosen order first, in that order; then any
// others (e.g. added to the curation since) in the curation's order.
export function arrangeItems<T>(
  items: T[],
  idOf: (item: T) => string,
  content: Pick<ComponentContent, "hiddenIds" | "orderIds">
): T[] {
  const hidden = new Set(content.hiddenIds);
  const shown = items.filter((item) => !hidden.has(idOf(item)));
  const rank = new Map(content.orderIds.map((id, i) => [id, i]));
  const ranked = shown.filter((item) => rank.has(idOf(item)));
  ranked.sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
  return [...ranked, ...shown.filter((item) => !rank.has(idOf(item)))];
}

// The items removed on the page, in the curation's order.
export function hiddenItems<T>(
  items: T[],
  idOf: (item: T) => string,
  content: Pick<ComponentContent, "hiddenIds">
): T[] {
  const hidden = new Set(content.hiddenIds);
  return items.filter((item) => hidden.has(idOf(item)));
}

// The longest Header that can be typed.
export const MAX_TYPED_TEXT = 300;
