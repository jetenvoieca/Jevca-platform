import { MAX_SECTION_TEXT } from "@/lib/curationSections";

// An Entries component's list (2026-10-24, from Louise Dear's Events &
// Projects): entries typed on the page in Arrange, each a date, a title
// and pictures — each a Supporting Image of the page's curation (by its
// id; null = none), with a caption and a description. An entry can be
// hidden. Kept as JSON in the component's content `text`. Plain module,
// so the server action, Arrange and the page share the same clean-up.

export type EntryPicture = { imageId: string | null; caption: string; text: string };

export type PageEntry = {
  id: string;
  date: string;
  title: string;
  hidden: boolean;
  pictures: EntryPicture[];
};

export const ENTRY_LIMITS = {
  entries: 100,
  pictures: 12,
  date: 60,
  title: 300,
  caption: 300,
  text: MAX_SECTION_TEXT,
} as const;

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function cleanPicture(raw: unknown): EntryPicture {
  const value = (raw ?? {}) as Partial<Record<keyof EntryPicture, unknown>>;
  return {
    imageId: typeof value.imageId === "string" && value.imageId ? value.imageId : null,
    caption: str(value.caption, ENTRY_LIMITS.caption),
    text: str(value.text, ENTRY_LIMITS.text),
  };
}

function cleanEntry(raw: unknown): PageEntry | null {
  const value = (raw ?? {}) as Partial<Record<keyof PageEntry, unknown>>;
  if (typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id.slice(0, 64),
    date: str(value.date, ENTRY_LIMITS.date),
    title: str(value.title, ENTRY_LIMITS.title),
    hidden: value.hidden === true,
    pictures: Array.isArray(value.pictures) ? value.pictures.slice(0, ENTRY_LIMITS.pictures).map(cleanPicture) : [],
  };
}

export function readEntries(text: string | null): PageEntry[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, ENTRY_LIMITS.entries)
      .map(cleanEntry)
      .filter((e): e is PageEntry => e !== null);
  } catch {
    return [];
  }
}

// The list as saved, words trimmed — null when there's nothing in it.
export function writeEntries(entries: PageEntry[]): string | null {
  const clean = entries.map((e) => ({
    ...e,
    date: e.date.trim(),
    title: e.title.trim(),
    pictures: e.pictures.map((p) => ({ ...p, caption: p.caption.trim(), text: p.text.trim() })),
  }));
  return clean.length ? JSON.stringify(clean) : null;
}

export function newEntry(): PageEntry {
  return { id: crypto.randomUUID(), date: "", title: "", hidden: false, pictures: [newEntryPicture()] };
}

export function newEntryPicture(): EntryPicture {
  return { imageId: null, caption: "", text: "" };
}
