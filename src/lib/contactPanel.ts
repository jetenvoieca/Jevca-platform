import { cleanColour, cleanNumber } from "@/lib/rowLayout";
import { isSiteFontId, type SiteFontId } from "@/lib/siteFonts";

// A site's Contact panel (2026-11-03, Craig's request — from the ISYT
// sites' contact page): a page whose menu item doesn't open a page of its
// own but slides this panel over whatever page is showing — its title,
// the phone and email from the artist's Settings, then a form (name,
// email, message, a tick box to join the mailing list) sent to the artist
// (lib/actions/websiteContact.ts). Set on that page in Pages → Edit
// (Page.contactPanel), one look for the whole site: covering `share` % of
// the page's width on the right (all of it on a phone), in its own font,
// text size and colours, the title `titleSize` pixels, bold. Its ✕ slides
// it away. Plain module, shared by the actions, the editor and the site.

export type ContactPanelSettings = {
  title: string;
  share: number;
  font: SiteFontId;
  textSize: number;
  titleSize: number;
  textColour: string;
  background: string;
};

export const CONTACT_PANEL_LIMITS = {
  title: 80,
  share: { min: 30, max: 100 },
  textSize: { min: 10, max: 32 },
  titleSize: { min: 12, max: 48 },
} as const;

// As the ISYT sites' contact page.
export const DEFAULT_CONTACT_PANEL: ContactPanelSettings = {
  title: "Contact / Mailing List",
  share: 50,
  font: "gelasio",
  textSize: 13,
  titleSize: 19,
  textColour: "#333333",
  background: "#ffffff",
};

export function cleanContactPanel(raw: unknown): ContactPanelSettings {
  const value = (raw ?? {}) as Partial<Record<keyof ContactPanelSettings, unknown>>;
  const d = DEFAULT_CONTACT_PANEL;
  const l = CONTACT_PANEL_LIMITS;
  return {
    title: typeof value.title === "string" ? value.title.trim().slice(0, l.title) : d.title,
    share: cleanNumber(value.share, l.share, d.share, 0),
    font: isSiteFontId(value.font) ? value.font : d.font,
    textSize: cleanNumber(value.textSize, l.textSize, d.textSize, 0),
    titleSize: cleanNumber(value.titleSize, l.titleSize, d.titleSize, 0),
    textColour: cleanColour(value.textColour) ?? d.textColour,
    background: cleanColour(value.background) ?? d.background,
  };
}

// A page's stored Contact panel — null for an ordinary page.
export function readContactPanel(raw: unknown): ContactPanelSettings | null {
  return raw && typeof raw === "object" ? cleanContactPanel(raw) : null;
}
