// Formatted text for mails (2026-10-08, Craig's choice: bold, italic and
// links) — the Text and Text Grid components. Stored as the editor's own
// document shape (paragraphs of text, line breaks, and the three marks),
// so nothing is ever kept as raw HTML. cleanRichText keeps only those
// parts, so whatever is saved — or sent from the browser — can always be
// turned into safe email HTML. Plain module, not "use server".

export type RichMark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };

export type RichParagraph = { type: "paragraph"; content?: RichInline[] };

export type RichText = { type: "doc"; content: RichParagraph[] };

export const EMPTY_RICH_TEXT: RichText = { type: "doc", content: [{ type: "paragraph" }] };

// A link must go to a web page or an email address; a bare
// "www.example.com" becomes https://www.example.com. Anything else
// (javascript:, data:, …) is refused.
export function cleanLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function cleanMarks(raw: unknown): RichMark[] {
  if (!Array.isArray(raw)) return [];
  const marks: RichMark[] = [];
  for (const m of raw as { type?: unknown; attrs?: { href?: unknown } }[]) {
    if (m?.type === "bold" && !marks.some((x) => x.type === "bold")) marks.push({ type: "bold" });
    if (m?.type === "italic" && !marks.some((x) => x.type === "italic")) marks.push({ type: "italic" });
    if (m?.type === "link" && !marks.some((x) => x.type === "link")) {
      const href = cleanLinkUrl(m.attrs?.href);
      if (href) marks.push({ type: "link", attrs: { href } });
    }
  }
  return marks;
}

function cleanInline(raw: unknown): RichInline | null {
  const node = raw as { type?: unknown; text?: unknown; marks?: unknown } | null;
  if (node?.type === "hardBreak") return { type: "hardBreak" };
  if (node?.type !== "text" || typeof node.text !== "string" || !node.text) return null;
  const marks = cleanMarks(node.marks);
  return marks.length > 0 ? { type: "text", text: node.text, marks } : { type: "text", text: node.text };
}

export function cleanRichText(raw: unknown): RichText {
  const doc = raw as { type?: unknown; content?: unknown } | null;
  if (doc?.type !== "doc" || !Array.isArray(doc.content)) return EMPTY_RICH_TEXT;
  const paragraphs = (doc.content as { type?: unknown; content?: unknown }[])
    .filter((p) => p?.type === "paragraph")
    .map((p): RichParagraph => {
      const content = Array.isArray(p.content)
        ? p.content.flatMap((n) => {
            const clean = cleanInline(n);
            return clean ? [clean] : [];
          })
        : [];
      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
    });
  return paragraphs.length > 0 ? { type: "doc", content: paragraphs } : EMPTY_RICH_TEXT;
}

export function isRichTextEmpty(doc: RichText): boolean {
  return !doc.content.some((p) => p.content?.some((n) => n.type === "text" && n.text.trim()));
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineToHtml(node: RichInline): string {
  if (node.type === "hardBreak") return "<br>";
  let html = escapeHtml(node.text);
  const marks = node.marks ?? [];
  if (marks.some((m) => m.type === "italic")) html = `<em>${html}</em>`;
  if (marks.some((m) => m.type === "bold")) html = `<strong>${html}</strong>`;
  const link = marks.find((m): m is Extract<RichMark, { type: "link" }> => m.type === "link");
  if (link) {
    html = `<a href="${escapeHtml(link.attrs.href)}" style="color:inherit;text-decoration:underline;">${html}</a>`;
  }
  return html;
}

// Email HTML for the text: one <p> per paragraph, each with the given
// inline style (email apps ignore most stylesheets), and space between
// paragraphs but not after the last. An empty paragraph keeps its line.
export function richTextToHtml(doc: RichText, paragraphStyle: string, gap: number): string {
  return doc.content
    .map((p, i) => {
      const inner = p.content?.map(inlineToHtml).join("") || "&nbsp;";
      const margin = i < doc.content.length - 1 ? `margin:0 0 ${gap}px 0;` : "margin:0;";
      return `<p style="${margin}${paragraphStyle}">${inner}</p>`;
    })
    .join("");
}
