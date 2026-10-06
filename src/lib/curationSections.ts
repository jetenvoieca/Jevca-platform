// A curation's presentation sections (2026-10-06) — the shapes and
// limits shared by the server actions (lib/actions/curationSections.ts),
// the Curations page editor and the curation panel on a page. Plain
// module, not "use server", so all of them can import it. See
// CurationSection in schema.prisma.

export const CURATION_SECTION_TYPES = [
  { value: "TAGLINE", label: "Tag line" },
  { value: "DESCRIPTION", label: "Description" },
  { value: "VIDEO", label: "Video" },
  { value: "TEXT", label: "Free text" },
  { value: "IMAGES", label: "Images" },
] as const;

export type CurationSectionType = (typeof CURATION_SECTION_TYPES)[number]["value"];

export function isCurationSectionType(value: string): value is CurationSectionType {
  return CURATION_SECTION_TYPES.some((t) => t.value === value);
}

export function curationSectionLabel(type: CurationSectionType): string {
  return CURATION_SECTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

// The section types that hold text — the ones with a height and a
// background colour (2026-10-06).
export function isTextSection(type: CurationSectionType): boolean {
  return type === "TAGLINE" || type === "DESCRIPTION" || type === "TEXT";
}

// One video or image in a section: `url` is the larger display version
// for a photo, the file itself for a video.
export type SectionMedia = {
  imageId: string;
  kind: "PHOTO" | "VIDEO";
  url: string;
  posterUrl: string | null;
};

// `height` is a minimum height in pixels, the text centred in it (null
// = just fits the text); `backgroundColor` is #rrggbb (null = none).
// Both apply to text sections only.
export type CurationSectionData = {
  id: string;
  type: CurationSectionType;
  heading: string | null;
  text: string | null;
  height: number | null;
  backgroundColor: string | null;
  media: SectionMedia[];
};

export const MAX_SECTION_HEADING = 200;
export const MAX_SECTION_TEXT = 20000;
export const MAX_SECTION_IMAGES = 20;
export const SECTION_HEIGHT_LIMITS = { min: 20, max: 2000 } as const;
