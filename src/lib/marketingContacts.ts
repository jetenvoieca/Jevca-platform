// Administration → Contacts: the shapes and fixed lists shared by its
// server actions (src/lib/actions/marketingContacts.ts) and its screen —
// kept here because a "use server" file can only export functions
// (2026-11-06).

export type MarketingContactType = "GALLERY" | "ARTIST";
export type MarketingWorksType = "ORIGINALS" | "PRINTS" | "SCULPTURE" | "PHOTOGRAPHY" | "MIXED_MEDIA";
export type MarketingCurrency = "GBP" | "EUR" | "USD";

export const WORKS_TYPES: MarketingWorksType[] = ["ORIGINALS", "PRINTS", "SCULPTURE", "PHOTOGRAPHY", "MIXED_MEDIA"];
export const CURRENCIES: MarketingCurrency[] = ["GBP", "EUR", "USD"];

// A gallery's artist or an artist's gallery, or a tag: an existing one
// (`id`), or, when saving, a new name (`id` null).
export type MarketingContactLinkRef = { id: string | null; name: string };

export type MarketingContactInput = {
  type: MarketingContactType;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  tiktok: string;
  town: string;
  country: string;
  notes: string;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: MarketingCurrency | null;
  worksTypes: MarketingWorksType[];
  links: MarketingContactLinkRef[];
  tags: MarketingContactLinkRef[];
};

export type MarketingContactRow = Omit<MarketingContactInput, "links" | "tags"> & {
  id: string;
  links: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export const WORKS_LABEL: Record<MarketingWorksType, string> = {
  ORIGINALS: "Originals",
  PRINTS: "Prints",
  SCULPTURE: "Sculpture",
  PHOTOGRAPHY: "Photography",
  MIXED_MEDIA: "Mixed media",
};
export const CURRENCY_SIGN: Record<MarketingCurrency, string> = { GBP: "£", EUR: "€", USD: "$" };

export const EMPTY_CONTACT: MarketingContactInput = {
  type: "GALLERY",
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  website: "",
  instagram: "",
  tiktok: "",
  town: "",
  country: "",
  notes: "",
  priceMin: null,
  priceMax: null,
  priceCurrency: null,
  worksTypes: [],
  links: [],
  tags: [],
};

// Import (2026-11-06): the CSV's columns, as the template has them.
// Headings are matched ignoring capitals and spaces; Type is Gallery or
// Artist (blank is Gallery); Works and Tags list several with ";"
// between; Currency is GBP, EUR or USD (or £, €, $).
export const IMPORT_COLUMNS = [
  "Type",
  "Name",
  "Contact person",
  "Email",
  "Phone",
  "Website",
  "Instagram",
  "TikTok",
  "Town",
  "Country",
  "Price from",
  "Price to",
  "Currency",
  "Works",
  "Tags",
  "Notes",
] as const;

// A CSV row to import, with its line in the file for reporting.
export type MarketingImportRow = { line: number; contact: MarketingContactInput };
export type MarketingImportResult = {
  created: number;
  merged: number;
  skipped: { line: number; reason: string }[];
};

const columnKey = (heading: string) => heading.toLowerCase().replace(/[^a-z]/g, "");
const several = (v: string) =>
  v
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
// "£1,500" → 1500; blank or not a number → none.
const amount = (v: string) => {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const currency = (v: string): MarketingCurrency | null => {
  const t = v.trim().toUpperCase();
  return CURRENCIES.find((c) => c === t || CURRENCY_SIGN[c] === t) ?? null;
};
const worksType = (v: string): MarketingWorksType | null => {
  const k = columnKey(v);
  return WORKS_TYPES.find((w) => columnKey(WORKS_LABEL[w]) === k || columnKey(w) === k) ?? null;
};

// A CSV row (heading → value) as a contact; what it doesn't have is
// blank. Checked properly when saved.
export function contactFromCsv(record: Record<string, string>): MarketingContactInput {
  const by = new Map(Object.entries(record).map(([h, v]) => [columnKey(h), (v ?? "").trim()]));
  const get = (heading: (typeof IMPORT_COLUMNS)[number]) => by.get(columnKey(heading)) ?? "";
  return {
    ...EMPTY_CONTACT,
    type: columnKey(get("Type")) === "artist" ? "ARTIST" : "GALLERY",
    name: get("Name"),
    contactPerson: get("Contact person"),
    email: get("Email"),
    phone: get("Phone"),
    website: get("Website"),
    instagram: get("Instagram"),
    tiktok: get("TikTok"),
    town: get("Town"),
    country: get("Country"),
    notes: get("Notes"),
    priceMin: amount(get("Price from")),
    priceMax: amount(get("Price to")),
    priceCurrency: currency(get("Currency")),
    worksTypes: WORKS_TYPES.filter((w) => several(get("Works")).map(worksType).includes(w)),
    tags: several(get("Tags")).map((name) => ({ id: null, name })),
  };
}
