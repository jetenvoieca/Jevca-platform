import { MAX_SECTION_TEXT, type CurationSectionType } from "@/lib/curationSections";
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
// - TYPED: `text`, typed on the page (a Header or Byline).
// `hiddenIds` / `orderIds`: works or Supporting Media removed on this
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
// 2026-10-13: a Header or Byline is typed in, a Text or Text grid takes the
// Description; 2026-10-16: a Single Image also takes the works, showing
// the first as arranged on the page; 2026-10-24: Entries are typed on the
// page — see lib/pageEntries.ts; 2026-10-25: a Page heading fills itself
// in and either line can be typed over — see lib/pageHeading.ts;
// 2026-10-24: a Text can also be typed
// on the page, for a text the curation's one Description isn't — e.g.
// Louise Dear's Materials and Commissions). Feature takes nothing yet. A Sign-up form (2026-10-10)
// takes no content: it's set up on its own in Arrange (see
// lib/signupForms.ts). A Logo (2026-10-13) is always the artist's own,
// and a Line (2026-10-23) is only a line.
const FITS: Record<LayoutBlockType, readonly ContentKind[]> = {
  header: ["TYPED"],
  byline: ["TYPED"],
  text: ["DESCRIPTION", "TYPED"],
  textgrid: ["DESCRIPTION"],
  video: ["VIDEO"],
  image: ["IMAGES", "WORKS"],
  gallery: ["IMAGES", "WORKS"],
  slidingdoors: ["WORKS"],
  entries: ["TYPED"],
  pageheading: ["TYPED"],
  hero: ["WORKS"],
  picturewords: ["IMAGES", "WORKS"],
  artwork: [],
  signup: [],
  logo: [],
  line: [],
};

export function contentFits(block: LayoutBlockType, kind: ContentKind): boolean {
  return FITS[block].includes(kind);
}

// Whether a component can be typed into. A Header or Byline only is; a
// Text is unless it holds the Description (see isTypedContent).
export function isTypedBlock(block: LayoutBlockType): boolean {
  return contentFits(block, "TYPED");
}

// Whether a component shows typed words: it can be typed into and holds
// nothing else (a Text holding the Description shows that instead).
export function isTypedContent(block: LayoutBlockType, content: Pick<ComponentContent, "source"> | null): boolean {
  return isTypedBlock(block) && (!content || content.source === "TYPED");
}

// Whether a component holds words typed on it as well as its pictures
// (see readHeroText): a Hero or a Picture & words.
export function hasTypedWords(block: LayoutBlockType): boolean {
  return block === "hero" || block === "picturewords";
}

// The longest text that can be typed into a component: a Text as long as
// a Description, a Header or Byline MAX_TYPED_TEXT.
export function maxTypedLength(block: LayoutBlockType): number {
  return block === "text" ? MAX_SECTION_TEXT : MAX_TYPED_TEXT;
}

// What a component's content is, given the curation's section types by
// id — null if its section is no longer in the curation.
export function contentKindOf(
  content: ComponentContent,
  sectionTypes: Map<string, CurationSectionType>,
): ContentKind | null {
  if (content.source === "WORKS") return "WORKS";
  if (content.source === "TYPED") return "TYPED";
  return (content.sectionId && sectionTypes.get(content.sectionId)) || null;
}

// Works or Supporting Media as one page shows them: those removed on the
// page left out; those in the chosen order first, in that order; then any
// others (e.g. added to the curation since) in the curation's order.
export function arrangeItems<T>(
  items: T[],
  idOf: (item: T) => string,
  content: Pick<ComponentContent, "hiddenIds" | "orderIds">,
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
  content: Pick<ComponentContent, "hiddenIds">,
): T[] {
  const hidden = new Set(content.hiddenIds);
  return items.filter((item) => hidden.has(idOf(item)));
}

// The longest Header or Byline that can be typed.
export const MAX_TYPED_TEXT = 300;

// A Hero's words (2026-10-22): the small line, the headline, its second
// line and the line under them (`below`, 2026-10-22) — a Picture & words
// (2026-10-24) uses the headline and second line — typed on the page and
// kept as JSON in its content's `text`; the content itself is the
// curation's works (or a Picture & words's Supporting Media).
// `headline` and `accent` may run over several lines.
const HERO_LINES = ["kicker", "headline", "accent", "below"] as const;

export type HeroText = Record<(typeof HERO_LINES)[number], string>;

export const EMPTY_HERO_TEXT: HeroText = { kicker: "", headline: "", accent: "", below: "" };

export function readHeroText(text: string | null): HeroText {
  if (!text) return EMPTY_HERO_TEXT;
  try {
    const v = JSON.parse(text) as Partial<Record<keyof HeroText, unknown>>;
    const line = (x: unknown) => (typeof x === "string" ? x.slice(0, MAX_TYPED_TEXT) : "");
    return Object.fromEntries(HERO_LINES.map((k) => [k, line(v[k])])) as HeroText;
  } catch {
    return EMPTY_HERO_TEXT;
  }
}

export function writeHeroText(hero: HeroText): string | null {
  const clean = Object.fromEntries(HERO_LINES.map((k) => [k, hero[k].trim()])) as HeroText;
  return HERO_LINES.some((k) => clean[k]) ? JSON.stringify(clean) : null;
}
