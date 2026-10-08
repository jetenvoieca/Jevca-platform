import { cleanColour } from "@/lib/rowLayout";
import { cleanLinkUrl, cleanRichText, EMPTY_RICH_TEXT, type RichText } from "@/lib/richText";
import type { MailBlock, MailBlockType, MailTemplateLayout } from "@/lib/mailTemplateLayout";

// What fills a campaign mail's components (2026-10-08, Marketing step 3)
// — saved in CampaignMail.content (JSON), keyed by component id. Every
// piece of text has an English and a French version; pictures, artworks,
// links and colours are the same in both. The Logo and Signature come
// from the artist's Settings, so they have no content here. Plain
// module, not "use server".

export const MAIL_LANGUAGES = [
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
] as const;

export type MailLanguage = (typeof MAIL_LANGUAGES)[number]["value"];

export type Localized<T> = Record<MailLanguage, T>;

// At most 3 images in a Gallery, and 3 columns in a Text Grid (Craig's
// choice).
export const MAX_GALLERY_PICTURES = 3;
export const MAX_TEXT_GRID_CELLS = 3;

// A picture from the Media catalogue, or an artwork's main image.
export type MailPicture = { kind: "media"; id: string } | { kind: "artwork"; id: string };

export function pictureKey(picture: MailPicture): string {
  return `${picture.kind}:${picture.id}`;
}

export type HeaderContent = { type: "header"; text: Localized<string> };
export type TextContent = { type: "text"; text: Localized<RichText> };
export type TextGridContent = { type: "textgrid"; cells: Localized<RichText>[] };
export type ImageContent = { type: "image"; picture: MailPicture | null };
export type GalleryContent = { type: "gallery"; pictures: MailPicture[] };
export type ArtworkContent = { type: "artwork"; artworkId: string | null };
export type ButtonContent = {
  type: "button";
  label: Localized<string>;
  url: string | null;
  colour: string | null;
  textColour: string | null;
};

export type BlockContent =
  | HeaderContent
  | TextContent
  | TextGridContent
  | ImageContent
  | GalleryContent
  | ArtworkContent
  | ButtonContent;

// The component types that have content of their own.
export type ContentBlockType = BlockContent["type"];

export type MailContent = Record<string, BlockContent>;

export const BUTTON_DEFAULT_COLOUR = "#111111";
export const BUTTON_DEFAULT_TEXT_COLOUR = "#ffffff";

const MAX_LINE = 300;

function cleanLine(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_LINE) : "";
}

function localized<T>(raw: unknown, clean: (v: unknown) => T): Localized<T> {
  const value = (raw ?? {}) as Partial<Record<MailLanguage, unknown>>;
  return { en: clean(value.en), fr: clean(value.fr) };
}

function cleanPicture(raw: unknown): MailPicture | null {
  const value = raw as { kind?: unknown; id?: unknown } | null;
  if (typeof value?.id !== "string" || !value.id) return null;
  if (value.kind === "media" || value.kind === "artwork") return { kind: value.kind, id: value.id };
  return null;
}

export function emptyContent(type: ContentBlockType): BlockContent {
  switch (type) {
    case "header":
      return { type, text: { en: "", fr: "" } };
    case "text":
      return { type, text: { en: EMPTY_RICH_TEXT, fr: EMPTY_RICH_TEXT } };
    case "textgrid":
      return { type, cells: [{ en: EMPTY_RICH_TEXT, fr: EMPTY_RICH_TEXT }] };
    case "image":
      return { type, picture: null };
    case "gallery":
      return { type, pictures: [] };
    case "artwork":
      return { type, artworkId: null };
    case "button":
      return { type, label: { en: "", fr: "" }, url: null, colour: null, textColour: null };
  }
}

export function hasContent(type: MailBlockType): type is ContentBlockType {
  return type !== "logo" && type !== "signature";
}

function cleanBlockContent(type: ContentBlockType, raw: unknown): BlockContent {
  const value = (raw ?? {}) as Record<string, unknown>;
  if (value.type !== type) return emptyContent(type);
  switch (type) {
    case "header":
      return { type, text: localized(value.text, cleanLine) };
    case "text":
      return { type, text: localized(value.text, cleanRichText) };
    case "textgrid": {
      const cells = Array.isArray(value.cells)
        ? value.cells.slice(0, MAX_TEXT_GRID_CELLS).map((c) => localized(c, cleanRichText))
        : [];
      return cells.length > 0 ? { type, cells } : emptyContent(type);
    }
    case "image":
      return { type, picture: cleanPicture(value.picture) };
    case "gallery": {
      const pictures = Array.isArray(value.pictures)
        ? value.pictures.flatMap((p) => {
            const clean = cleanPicture(p);
            return clean ? [clean] : [];
          })
        : [];
      return { type, pictures: pictures.slice(0, MAX_GALLERY_PICTURES) };
    }
    case "artwork":
      return {
        type,
        artworkId: typeof value.artworkId === "string" && value.artworkId ? value.artworkId : null,
      };
    case "button":
      return {
        type,
        label: localized(value.label, cleanLine),
        url: cleanLinkUrl(value.url),
        colour: cleanColour(value.colour),
        textColour: cleanColour(value.textColour),
      };
  }
}

// Keeps content only for the mail's own components, each of the right
// type — so removing a component drops its content, and a component
// without any yet starts empty.
export function cleanMailContent(raw: unknown, layout: MailTemplateLayout): MailContent {
  const value = (raw ?? {}) as Record<string, unknown>;
  const content: MailContent = {};
  for (const block of layout.blocks) {
    if (hasContent(block.type)) content[block.id] = cleanBlockContent(block.type, value[block.id]);
  }
  return content;
}

// A component's content, or empty content for its type.
export function contentOf<T extends ContentBlockType>(
  content: MailContent,
  block: MailBlock & { type: T }
): Extract<BlockContent, { type: T }> {
  const found = content[block.id];
  return (found?.type === block.type ? found : emptyContent(block.type)) as Extract<
    BlockContent,
    { type: T }
  >;
}

// Every picture and artwork the mail shows, so they can be looked up in
// one go.
export function mailReferences(content: MailContent): {
  pictures: MailPicture[];
  artworkIds: string[];
} {
  const pictures: MailPicture[] = [];
  const artworkIds: string[] = [];
  for (const c of Object.values(content)) {
    if (c.type === "image" && c.picture) pictures.push(c.picture);
    if (c.type === "gallery") pictures.push(...c.pictures);
    if (c.type === "artwork" && c.artworkId) artworkIds.push(c.artworkId);
  }
  return { pictures, artworkIds: [...new Set(artworkIds)] };
}
