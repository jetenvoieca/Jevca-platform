// The currencies the platform prices and sells artworks in — an artwork's
// price (Artwork.priceCurrency) and every sale recorded or taken.
export const CURRENCIES = ["GBP", "EUR"] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// An amount as money, e.g. "£1,234.00" — the one way amounts are shown.
// Takes a number or a decimal string (as prices come from the server).
export function formatMoney(amount: number | string, currency: string): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}
