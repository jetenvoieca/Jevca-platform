// A curation's presentation sections (2026-10-06) — the shapes and
// limits shared by the server actions (lib/actions/curationSections.ts),
// the Curations page editor and the curation panel on a page. Plain
// module, not "use server", so all of them can import it. See
// CurationSection in schema.prisma.
//
// Every curation has exactly these two, in this order (2026-10-13,
// Craig's mockup; the separate Video merged into Supporting Media
// 2026-10-31) — never added, removed or reordered. Further layout is done
// in Pages.

export const CURATION_SECTION_TYPES = [
  { value: "DESCRIPTION", label: "Description" },
  // Pictures and videos (2026-10-25, was pictures only), for story pages
  // and galleries.
  { value: "IMAGES", label: "Supporting Media" },
] as const;

export type CurationSectionType = (typeof CURATION_SECTION_TYPES)[number]["value"];

export function isCurationSectionType(value: string): value is CurationSectionType {
  return CURATION_SECTION_TYPES.some((t) => t.value === value);
}

export function curationSectionLabel(type: CurationSectionType): string {
  return CURATION_SECTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

// One video or image in a section: `url` is the larger display version
// for a photo, the file itself for a video.
export type SectionMedia = {
  imageId: string;
  kind: "PHOTO" | "VIDEO";
  url: string;
  posterUrl: string | null;
};

export type CurationSectionData = {
  id: string;
  type: CurationSectionType;
  text: string | null;
  media: SectionMedia[];
};

// Whether a section has nothing to show yet — empty sections are left
// out wherever they're shown.
export function sectionIsEmpty(section: CurationSectionData): boolean {
  return section.type === "DESCRIPTION" ? !section.text : section.media.length === 0;
}

export const MAX_SECTION_TEXT = 20000;
export const MAX_SUPPORTING_MEDIA = 20;
