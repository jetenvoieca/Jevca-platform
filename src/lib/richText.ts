// Formatted text (2026-10-05) — paragraphs with bold, italic and links,
// nothing else. First used for a Curation's Description. Written with
// RichTextEditor and shown with RichTextView (both in components/).
//
// Stored as JSON in the editor's own document shape, never as HTML, so
// it can be shown on the admin screens and on every artist's website
// without ever inserting raw HTML into a page. Anything saved is first
// rebuilt through toRichTextDoc below, which keeps only the parts listed
// here — whatever is sent, nothing else can be stored or shown.

export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string } };

export type RichTextInline =
  | { type: "text"; text: string; marks?: RichTextMark[] }
  | { type: "hardBreak" };

export type RichTextParagraph = { type: "paragraph"; content?: RichTextInline[] };

export type RichTextDoc = { type: "doc"; content: RichTextParagraph[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A link's address, made safe and complete — "example.com" becomes
// "https://example.com". Only web and email links are allowed; anything
// else (e.g. "javascript:") gives null.
export function safeLinkHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.protocol !== "mailto:" && !url.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

function cleanMarks(raw: unknown): RichTextMark[] {
  if (!Array.isArray(raw)) return [];
  const marks: RichTextMark[] = [];
  const seen = new Set<string>();
  for (const mark of raw) {
    if (!isObject(mark) || typeof mark.type !== "string" || seen.has(mark.type)) continue;
    if (mark.type === "bold" || mark.type === "italic") {
      marks.push({ type: mark.type });
      seen.add(mark.type);
    } else if (mark.type === "link") {
      const href = safeLinkHref(isObject(mark.attrs) ? mark.attrs.href : null);
      if (href) {
        marks.push({ type: "link", attrs: { href } });
        seen.add("link");
      }
    }
  }
  return marks;
}

// Rebuilds a document from anything (the editor's output, or a stored
// value), keeping only paragraphs, line breaks, text, bold, italic and
// safe links. Null when there's no text at all, so a cleared
// Description is stored as nothing rather than an empty document.
export function toRichTextDoc(raw: unknown): RichTextDoc | null {
  if (!isObject(raw) || raw.type !== "doc" || !Array.isArray(raw.content)) return null;

  const paragraphs: RichTextParagraph[] = [];
  let hasText = false;
  for (const block of raw.content) {
    if (!isObject(block) || block.type !== "paragraph") continue;
    const content: RichTextInline[] = [];
    if (Array.isArray(block.content)) {
      for (const node of block.content) {
        if (!isObject(node)) continue;
        if (node.type === "hardBreak") {
          content.push({ type: "hardBreak" });
        } else if (node.type === "text" && typeof node.text === "string" && node.text) {
          const marks = cleanMarks(node.marks);
          content.push(
            marks.length > 0
              ? { type: "text", text: node.text, marks }
              : { type: "text", text: node.text }
          );
          if (node.text.trim()) hasText = true;
        }
      }
    }
    paragraphs.push(content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
  }
  return hasText ? { type: "doc", content: paragraphs } : null;
}

// How many characters of text a document holds — for length limits.
export function richTextLength(doc: RichTextDoc): number {
  let length = 0;
  for (const paragraph of doc.content) {
    for (const node of paragraph.content ?? []) {
      if (node.type === "text") length += node.text.length;
    }
  }
  return length;
}

// The look shared by the editor and the view, so text reads the same
// while being written as when shown.
export const RICH_TEXT_CLASS =
  "space-y-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800 [&_a]:text-neutral-900 [&_a]:underline [&_a]:underline-offset-2";
