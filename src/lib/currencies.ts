// The currencies the platform prices and sells artworks in — an artwork's
// price (Artwork.priceCurrency) and every sale recorded or taken.
export const CURRENCIES = ["GBP", "EUR"] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// An amount as money — the one way amounts are shown (2026-10-29: was
// copied into most screens). Takes a number or a decimal string (as
// prices come from the server). `pence`: "always" (£1,995.00 — sales,
// invoices, accounts) or "when-any" (£1,995 but £4,999.50 — prices on
// presentations and website pages). An unrecognised currency code shows
// as the code and the amount rather than failing.
export function formatMoney(
  amount: number | string,
  currency: string,
  pence: "always" | "when-any" = "always",
): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  const digits = pence === "always" || !Number.isInteger(n) ? 2 : 0;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(digits)}`;
  }
}
