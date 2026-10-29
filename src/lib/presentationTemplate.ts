import { isSiteFontId, type SiteFontId } from "@/lib/siteFonts";

// A Presentation Template's settings (2026-10-19, Craig's request) — how
// a work's details look when a visitor opens it on a page: the layout,
// colours and fonts, which details show, and the buttons' wording. Plain
// module, shared by the editor, the server and the window itself
// (CurationWorkView). The defaults are the first template, adapted from
// Louise Dear's website: picture on the left with the title and details
// under it; on the right the medium, the description, Purchase and Pay in
// instalments, the instalment terms, Enquire, and where it can be seen.
// Enquire opens the enquiry form in place of the price and buttons
// (2026-10-19, see WorkEnquiryForm).

export const PRESENTATION_LAYOUTS = [
  { value: "side", label: "Picture on the left" },
  { value: "stacked", label: "Picture on top" },
] as const;
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number]["value"];

// The details and buttons that can be turned on or off, in the order the
// editor lists them.
export const PRESENTATION_PARTS = [
  { key: "medium", label: "Medium" },
  { key: "edition", label: "Edition and type" },
  { key: "size", label: "Size" },
  { key: "description", label: "Description" },
  { key: "price", label: "Price" },
  { key: "purchase", label: "Purchase button" },
  { key: "instalments", label: "Instalments button" },
  { key: "instalmentTerms", label: "Instalment terms" },
  { key: "enquire", label: "Enquire button" },
  { key: "location", label: "Where it can be seen" },
  { key: "mailingList", label: "Enquiry: mailing list tick box" },
  { key: "instagram", label: "Enquiry: Instagram button" },
  { key: "enquiryEmail", label: "Enquiry: email address" },
] as const;
export type PresentationPart = (typeof PRESENTATION_PARTS)[number]["key"];

// The wording, in three groups: the details and buttons, the enquiry
// form, and the payment form (whose name and email boxes are the enquiry
// form's). {count}, {amount}, {location}, {artist} (the artist's first
// name), {instagram}, {price} and {today} (what's paid now) are filled
// in.
export const PRESENTATION_LABELS = [
  { key: "purchase", group: "details", label: "Purchase button", hint: "" },
  { key: "instalments", group: "details", label: "Instalments button", hint: "{count} = number of payments" },
  {
    key: "instalmentTerms",
    group: "details",
    label: "Instalment terms",
    hint: "{count}, {amount}; the release message follows",
  },
  { key: "enquire", group: "details", label: "Enquire button", hint: "" },
  { key: "location", group: "details", label: "Where it can be seen", hint: "{location} = the place" },
  { key: "sold", group: "details", label: "When sold", hint: "" },
  { key: "back", group: "details", label: "Back from a form", hint: "" },
  { key: "nameLabel", group: "enquiry", label: "Name", hint: "" },
  { key: "namePlaceholder", group: "enquiry", label: "Name box", hint: "" },
  { key: "emailLabel", group: "enquiry", label: "Email", hint: "" },
  { key: "emailPlaceholder", group: "enquiry", label: "Email box", hint: "" },
  { key: "messageLabel", group: "enquiry", label: "Message", hint: "" },
  { key: "messagePlaceholder", group: "enquiry", label: "Message box", hint: "{artist} = the artist's first name" },
  { key: "mailingList", group: "enquiry", label: "Mailing list tick box", hint: "" },
  { key: "send", group: "enquiry", label: "Send button", hint: "" },
  { key: "instagram", group: "enquiry", label: "Instagram button", hint: "{instagram} = the artist's username" },
  { key: "sent", group: "enquiry", label: "Once sent", hint: "" },
  { key: "payFull", group: "payment", label: "Paying in full", hint: "{price} = the price" },
  {
    key: "payInstalments",
    group: "payment",
    label: "Paying in instalments",
    hint: "{count}, {amount}, {price}",
  },
  { key: "addressLabel", group: "payment", label: "Address", hint: "" },
  { key: "addressPlaceholder", group: "payment", label: "Address box", hint: "" },
  { key: "cityPlaceholder", group: "payment", label: "Town box", hint: "" },
  { key: "postcodePlaceholder", group: "payment", label: "Postcode box", hint: "" },
  { key: "countryPlaceholder", group: "payment", label: "Country box", hint: "" },
  { key: "holdNote", group: "payment", label: "Holding note", hint: "" },
  { key: "continue", group: "payment", label: "Continue button", hint: "" },
  { key: "pay", group: "payment", label: "Pay button", hint: "{today} = what's paid now" },
  { key: "paid", group: "payment", label: "Once paid", hint: "" },
] as const;
export type PresentationLabel = (typeof PRESENTATION_LABELS)[number]["key"];

export type PresentationColours = {
  background: string;
  border: string;
  text: string;
  muted: string;
  purchaseBackground: string;
  purchaseText: string;
  instalmentsBackground: string;
  instalmentsText: string;
  enquireBackground: string;
  enquireText: string;
  fieldBackground: string;
};

export const PRESENTATION_COLOURS: { key: keyof PresentationColours; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "border", label: "Border" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Quiet text" },
  { key: "purchaseBackground", label: "Purchase button" },
  { key: "purchaseText", label: "Purchase button text" },
  { key: "instalmentsBackground", label: "Instalments button" },
  { key: "instalmentsText", label: "Instalments button text" },
  { key: "enquireBackground", label: "Enquire button" },
  { key: "enquireText", label: "Enquire button text" },
  { key: "fieldBackground", label: "Enquiry boxes" },
];

export type PresentationSettings = {
  layout: PresentationLayout;
  // The window's widest, in pixels — it's narrower on a smaller screen.
  maxWidth: number;
  // The picture's share of the width, beside the words.
  pictureShare: number;
  colours: PresentationColours;
  borderWidth: number;
  rounding: number;
  buttonRounding: number;
  // Every button's height, in pixels (2026-10-20) — a little taller if
  // its words go onto two lines.
  buttonHeight: number;
  titleFont: SiteFontId;
  textFont: SiteFontId;
  titleSize: number;
  textSize: number;
  // Line spacing, as a multiple of the text size.
  lineSpacing: number;
  show: Record<PresentationPart, boolean>;
  labels: Record<PresentationLabel, string>;
};

export const DEFAULT_PRESENTATION: PresentationSettings = {
  layout: "side",
  maxWidth: 1000,
  pictureShare: 48,
  colours: {
    background: "#f7f6f2",
    border: "#a8a8a8",
    text: "#1f1f1f",
    muted: "#8a8a8a",
    purchaseBackground: "#e48aa5",
    purchaseText: "#ffffff",
    instalmentsBackground: "#f7e1e8",
    instalmentsText: "#d77d99",
    enquireBackground: "#3b3735",
    enquireText: "#ffffff",
    fieldBackground: "#ffffff",
  },
  borderWidth: 1,
  rounding: 40,
  buttonRounding: 0,
  buttonHeight: 44,
  titleFont: "jost",
  textFont: "jost",
  titleSize: 40,
  textSize: 17,
  lineSpacing: 2,
  show: {
    medium: true,
    edition: true,
    size: true,
    description: true,
    price: false,
    purchase: true,
    instalments: true,
    instalmentTerms: true,
    enquire: true,
    location: true,
    mailingList: true,
    instagram: true,
    enquiryEmail: true,
  },
  labels: {
    purchase: "Purchase",
    instalments: "Pay in {count} instalments",
    instalmentTerms: "{count} monthly payments of {amount}",
    enquire: "Enquire about this work",
    location: "This work can be viewed at {location}",
    sold: "Sold",
    back: "← Back",
    nameLabel: "Your name",
    namePlaceholder: "Full name",
    emailLabel: "Email address",
    emailPlaceholder: "your@email.com",
    messageLabel: "Message",
    messagePlaceholder: "Tell {artist} what you have in mind...",
    mailingList: "Join my mailing list for news and special releases (easy to cancel)",
    send: "Send message",
    instagram: "Or DM on Instagram @{instagram}",
    sent: "Thank you — your message has been sent.",
    payFull: "Purchase — {price}",
    payInstalments: "{count} monthly payments of {amount}",
    addressLabel: "Delivery address",
    addressPlaceholder: "Address",
    cityPlaceholder: "Town or city",
    postcodePlaceholder: "Postcode",
    countryPlaceholder: "Country",
    holdNote: "We'll hold this work for you for 30 minutes while you pay.",
    continue: "Continue to payment",
    pay: "Pay {today}",
    paid: "Thank you — your payment has gone through. Your receipt is on its way by email.",
  },
};

export const PRESENTATION_LIMITS = {
  maxWidth: { min: 500, max: 1600 },
  pictureShare: { min: 30, max: 70 },
  borderWidth: { min: 0, max: 4 },
  rounding: { min: 0, max: 48 },
  buttonRounding: { min: 0, max: 30 },
  buttonHeight: { min: 32, max: 72 },
  titleSize: { min: 16, max: 60 },
  textSize: { min: 12, max: 24 },
  lineSpacing: { min: 1, max: 2.6 },
} as const;

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const MAX_LABEL = 80;

function cleanColour(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOUR.test(value) ? value.toLowerCase() : fallback;
}

function cleanNumber(value: unknown, limits: { min: number; max: number }, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(n * 10) / 10));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// Any saved value made valid, with the defaults for anything missing —
// so a template saved before a setting existed still shows properly.
export function normalizePresentation(raw: unknown): PresentationSettings {
  const v = record(raw);
  const d = DEFAULT_PRESENTATION;
  const l = PRESENTATION_LIMITS;
  const colours = record(v.colours);
  const show = record(v.show);
  const labels = record(v.labels);
  return {
    layout: PRESENTATION_LAYOUTS.some((o) => o.value === v.layout) ? (v.layout as PresentationLayout) : d.layout,
    maxWidth: cleanNumber(v.maxWidth, l.maxWidth, d.maxWidth),
    pictureShare: cleanNumber(v.pictureShare, l.pictureShare, d.pictureShare),
    colours: Object.fromEntries(
      PRESENTATION_COLOURS.map(({ key }) => [key, cleanColour(colours[key], d.colours[key])]),
    ) as PresentationColours,
    borderWidth: cleanNumber(v.borderWidth, l.borderWidth, d.borderWidth),
    rounding: cleanNumber(v.rounding, l.rounding, d.rounding),
    buttonRounding: cleanNumber(v.buttonRounding, l.buttonRounding, d.buttonRounding),
    buttonHeight: cleanNumber(v.buttonHeight, l.buttonHeight, d.buttonHeight),
    titleFont: isSiteFontId(v.titleFont) ? v.titleFont : d.titleFont,
    textFont: isSiteFontId(v.textFont) ? v.textFont : d.textFont,
    titleSize: cleanNumber(v.titleSize, l.titleSize, d.titleSize),
    textSize: cleanNumber(v.textSize, l.textSize, d.textSize),
    lineSpacing: cleanNumber(v.lineSpacing, l.lineSpacing, d.lineSpacing),
    show: Object.fromEntries(
      PRESENTATION_PARTS.map(({ key }) => [key, typeof show[key] === "boolean" ? show[key] : d.show[key]]),
    ) as Record<PresentationPart, boolean>,
    labels: Object.fromEntries(
      PRESENTATION_LABELS.map(({ key }) => [
        key,
        typeof labels[key] === "string" ? (labels[key] as string).slice(0, MAX_LABEL) : d.labels[key],
      ]),
    ) as Record<PresentationLabel, string>,
  };
}

// A label with its {placeholders} filled in.
export function fillLabel(label: string, values: Record<string, string>): string {
  return label.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}

