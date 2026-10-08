import type { Localized, MailContent } from "@/lib/mailContent";
import {
  cleanRichText,
  isRichTextEmpty,
  type RichInline,
  type RichMark,
  type RichText,
} from "@/lib/richText";

// A campaign mail's "Translate now" (2026-10-08, from Craig's mockup and
// Louise's own site): the English of every part whose French is still
// empty — the subject, the preview text, and each component's text — is
// translated, and only those French parts are filled. Formatted text
// travels as simple tags (<b>, <i>, <br>, <a n="1">) so its bold, italic
// and links come back in place; the link addresses themselves never
// leave this module. Plain module, not "use server".

export type TranslatableMail = {
  content: MailContent;
  subject: Localized<string>;
  preview: Localized<string>;
};

// One part to translate: a line of plain text, or formatted text as one
// tagged string per paragraph (with its links' addresses, by number).
export type TranslationPiece =
  | { key: string; kind: "line"; text: string }
  | { key: string; kind: "rich"; paragraphs: string[]; links: string[] };

// The French that comes back, by piece key.
export type FrenchFill = Record<string, string | RichText>;

const blank = (s: string) => !s.trim();

// Every part with English but no French yet.
export function frenchGaps(mail: TranslatableMail): TranslationPiece[] {
  const pieces: TranslationPiece[] = [];
  const line = (key: string, text: Localized<string>) => {
    if (!blank(text.en) && blank(text.fr)) pieces.push({ key, kind: "line", text: text.en });
  };
  const rich = (key: string, text: Localized<RichText>) => {
    if (!isRichTextEmpty(text.en) && isRichTextEmpty(text.fr)) {
      pieces.push({ key, kind: "rich", ...richTextToTags(text.en) });
    }
  };
  line("subject", mail.subject);
  line("preview", mail.preview);
  for (const [id, c] of Object.entries(mail.content)) {
    if (c.type === "header") line(`header:${id}`, c.text);
    if (c.type === "button") line(`button:${id}`, c.label);
    if (c.type === "text") rich(`text:${id}`, c.text);
    if (c.type === "textgrid") c.cells.forEach((cell, i) => rich(`cell:${id}:${i}`, cell));
  }
  return pieces;
}

// Whether nothing at all has been put in French yet (the "No French
// version yet" note), rather than just some parts missing.
export function hasNoFrench(mail: TranslatableMail): boolean {
  const anyFrench =
    !blank(mail.subject.fr) ||
    !blank(mail.preview.fr) ||
    Object.values(mail.content).some((c) => {
      if (c.type === "header") return !blank(c.text.fr);
      if (c.type === "button") return !blank(c.label.fr);
      if (c.type === "text") return !isRichTextEmpty(c.text.fr);
      if (c.type === "textgrid") return c.cells.some((cell) => !isRichTextEmpty(cell.fr));
      return false;
    });
  return !anyFrench;
}

// Puts the French in, but only where it's still empty — anything typed
// while the translation was on its way is kept.
export function applyFrench<T extends TranslatableMail>(mail: T, fill: FrenchFill): T {
  const line = (key: string, text: Localized<string>): Localized<string> => {
    const fr = fill[key];
    return typeof fr === "string" && blank(text.fr) ? { ...text, fr } : text;
  };
  const rich = (key: string, text: Localized<RichText>): Localized<RichText> => {
    const fr = fill[key];
    return fr && typeof fr !== "string" && isRichTextEmpty(text.fr) ? { ...text, fr } : text;
  };
  const content: MailContent = {};
  for (const [id, c] of Object.entries(mail.content)) {
    if (c.type === "header") content[id] = { ...c, text: line(`header:${id}`, c.text) };
    else if (c.type === "button") content[id] = { ...c, label: line(`button:${id}`, c.label) };
    else if (c.type === "text") content[id] = { ...c, text: rich(`text:${id}`, c.text) };
    else if (c.type === "textgrid") {
      content[id] = { ...c, cells: c.cells.map((cell, i) => rich(`cell:${id}:${i}`, cell)) };
    } else content[id] = c;
  }
  return {
    ...mail,
    content,
    subject: line("subject", mail.subject),
    preview: line("preview", mail.preview),
  };
}

function escapeTags(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeTags(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Formatted text as one tagged string per paragraph, e.g.
// `Come and see <b>the new work</b> at <a n="1">the studio</a>`.
export function richTextToTags(doc: RichText): { paragraphs: string[]; links: string[] } {
  const links: string[] = [];
  const paragraphs = doc.content.map((p) =>
    (p.content ?? [])
      .map((node) => {
        if (node.type === "hardBreak") return "<br>";
        let out = escapeTags(node.text);
        const marks = node.marks ?? [];
        if (marks.some((m) => m.type === "italic")) out = `<i>${out}</i>`;
        if (marks.some((m) => m.type === "bold")) out = `<b>${out}</b>`;
        const link = marks.find((m): m is Extract<RichMark, { type: "link" }> => m.type === "link");
        if (link) {
          let n = links.indexOf(link.attrs.href) + 1;
          if (n === 0) n = links.push(link.attrs.href);
          out = `<a n="${n}">${out}</a>`;
        }
        return out;
      })
      .join("")
  );
  return { paragraphs, links };
}

// The tagged paragraphs back into formatted text. Unknown tags are
// dropped; a link number that doesn't exist loses its link.
export function tagsToRichText(paragraphs: string[], links: string[]): RichText {
  const content = paragraphs.map((p) => {
    const nodes: RichInline[] = [];
    let bold = 0;
    let italic = 0;
    let href: string | null = null;
    for (const token of p.match(/<[^>]*>|[^<]+/g) ?? []) {
      const tag = token.match(/^<\s*(\/?)\s*([a-z]+)([^>]*)>$/i);
      if (!tag) {
        const marks: RichMark[] = [];
        if (bold > 0) marks.push({ type: "bold" });
        if (italic > 0) marks.push({ type: "italic" });
        if (href) marks.push({ type: "link", attrs: { href } });
        nodes.push({ type: "text", text: unescapeTags(token), ...(marks.length ? { marks } : {}) });
        continue;
      }
      const closing = tag[1] === "/";
      const name = tag[2].toLowerCase();
      if (name === "br") nodes.push({ type: "hardBreak" });
      else if (name === "b" || name === "strong") bold = Math.max(0, bold + (closing ? -1 : 1));
      else if (name === "i" || name === "em") italic = Math.max(0, italic + (closing ? -1 : 1));
      else if (name === "a") {
        const n = Number(tag[3].match(/n\s*=\s*"?(\d+)/)?.[1]);
        href = closing ? null : (links[n - 1] ?? null);
      }
    }
    return { type: "paragraph", content: nodes };
  });
  return cleanRichText({ type: "doc", content });
}
