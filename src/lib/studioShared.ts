// Small helpers shared by the Studio screens (in the browser) and the
// Studio routes (on the server) — plain functions and constants with no
// database or browser dependencies.

// Whether an artwork's Type is an edition, which gives it an edition
// number (e.g. 5/25) the artist can set when consigning or selling it.
// Matched loosely, as in the admin Catalogue: any Type containing
// "edition" ("Edition", "Giclée Edition", "Limited Edition").
export function isEditionType(type: string | null): boolean {
  return (type ?? "").toLowerCase().includes("edition");
}

// What the app sends to start taking payment for an artwork, by card or by
// payment link. `deposit` is "" when there is none; `saleDate` is
// YYYY-MM-DD; `instalmentCount` is how many instalments the net due is
// split into when `option` is INSTALMENTS. `edition` is the edition number
// to save on the artwork ("" clears it), or null to leave it unchanged —
// only an edition-type artwork sends one.
export type StudioPaymentDetails = {
  artworkId: string;
  edition: string | null;
  saleDate: string;
  price: string;
  currency: string;
  deposit: string;
  option: "FULL" | "INSTALMENTS";
  instalmentCount: number;
  source: string;
  buyerName: string;
  buyerEmail: string;
};

// Accepts "1200", "1 200", "1200,50" or "1200.50". Returns the plain
// number string the server expects, "" when left blank, or null when
// it isn't a valid price.
export function parsePrice(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return "";
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : null;
}

// A stored price such as "450.00" as it should appear in a price field
// ("450", or "450.5").
export function priceToInput(price: string | null): string {
  if (!price) return "";
  const n = parseFloat(price);
  return Number.isFinite(n) ? String(n) : "";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

// Today's date on the phone's own calendar, as a date field expects it
// (YYYY-MM-DD).
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
