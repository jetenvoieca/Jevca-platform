import { isMailFontId, type MailFontId } from "@/lib/mailFonts";
import {
  DEFAULT_GRID_SPACING,
  cleanColour,
  cleanGridSpacing,
  cleanPageMargins,
  cleanRowBlock,
  cleanRows,
  clearLoneRows,
  type GridSpacing,
  type PageMargins,
  type RowBlock,
  type RowLayout,
} from "@/lib/rowLayout";
import { cleanTextStyles, type TextStyle, type TextStyles } from "@/lib/textStyle";

// The layout a Mail Template holds (2026-10-08, Marketing step 2) — a
// starting point for a campaign's mails: its components, rows, widths,
// spacing, alignment, margins, colours and text look, never content.
// Saved in MailTemplate.layout (JSON). Templates are shared by every
// site, like Page Styles. A mail copies its template's layout and can
// add, move or remove components itself; its content (EN and FR) is
// entered in the mail. Built with the same rows as a Page Style (see
// lib/rowLayout.ts). Plain module, not "use server".
//
// Every mail is the standard email width on desktop; on a phone its
// components stack, each full width. Every mail ends with a footer: the
// artist's name and address, a link to their website and the
// unsubscribe link.

export const MAIL_WIDTH = 600;

// The components a mail is built from (Craig's choice: the Page Styles
// components minus Video and Sliding doors, plus Logo, Button and
// Signature). A Button's text, link and colours are set in each mail;
// the Logo and Signature are the artist's own images (Settings →
// Invoicing), placed anywhere in the mail like any other component.
export const MAIL_BLOCK_TYPES = [
  { value: "logo", label: "Logo" },
  { value: "header", label: "Header" },
  { value: "text", label: "Text" },
  { value: "image", label: "Single Image" },
  { value: "gallery", label: "Gallery" },
  { value: "artwork", label: "Feature" },
  { value: "textgrid", label: "Text Grid" },
  { value: "button", label: "Button" },
  { value: "signature", label: "Signature" },
] as const;

export type MailBlockType = (typeof MAIL_BLOCK_TYPES)[number]["value"];

function isMailBlockType(value: unknown): value is MailBlockType {
  return MAIL_BLOCK_TYPES.some((t) => t.value === value);
}

export function mailBlockTypeLabel(type: MailBlockType): string {
  return MAIL_BLOCK_TYPES.find((t) => t.value === type)?.label ?? type;
}

export type MailBlock = RowBlock<MailBlockType>;

export type MailTextStyle = TextStyle<MailFontId>;

export type MailTemplateLayout = RowLayout<MailBlock> & {
  // The colour around the mail, and the mail's own background; null =
  // the email app's own (usually white).
  surroundColor: string | null;
  backgroundColor: string | null;
  // Spacing for every Gallery component.
  gridSpacing: GridSpacing;
  // How the text in its Header, Text and Text grid components looks.
  textStyles: TextStyles<MailFontId>;
};

// More room at the edges than a page has by default, as is usual for
// email; narrower on a phone.
const DEFAULT_MAIL_MARGINS: PageMargins = {
  desktop: { vertical: 24, horizontal: 24 },
  phone: { vertical: 16, horizontal: 16 },
};

const DEFAULT_TEXT_STYLE: MailTextStyle = { font: null, size: null, look: null, colour: null };

// A new template starts with the Logo at the top, which can then be
// moved or removed like any other component.
export function newMailTemplateLayout(): MailTemplateLayout {
  return {
    surroundColor: null,
    backgroundColor: null,
    gridSpacing: DEFAULT_GRID_SPACING,
    margins: DEFAULT_MAIL_MARGINS,
    textStyles: { header: DEFAULT_TEXT_STYLE, text: DEFAULT_TEXT_STYLE, textgrid: DEFAULT_TEXT_STYLE },
    rows: {},
    blocks: [newMailBlock("logo")],
  };
}

// Turns whatever is stored (or sent from the browser) into a valid
// layout — anything unknown or malformed is dropped, so a bad value can
// never break the editor, the preview or a mail.
export function normalizeMailTemplate(raw: unknown): MailTemplateLayout {
  const value = (raw ?? {}) as Partial<Record<keyof MailTemplateLayout, unknown>>;
  const blocks = clearLoneRows(
    Array.isArray(value.blocks)
      ? value.blocks.flatMap((b) => {
          const clean = cleanRowBlock(b, isMailBlockType);
          return clean ? [clean] : [];
        })
      : []
  );
  return {
    surroundColor: cleanColour(value.surroundColor),
    backgroundColor: cleanColour(value.backgroundColor),
    gridSpacing: cleanGridSpacing(value.gridSpacing),
    margins: cleanPageMargins(value.margins, DEFAULT_MAIL_MARGINS),
    textStyles: cleanTextStyles(value.textStyles, isMailFontId),
    rows: cleanRows(value.rows, blocks),
    blocks,
  };
}

export function newMailBlock(type: MailBlockType): MailBlock {
  return { id: crypto.randomUUID(), type };
}
