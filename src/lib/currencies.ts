// The currencies the platform prices and sells artworks in — an artwork's
// price (Artwork.priceCurrency) and every sale recorded or taken.
export const CURRENCIES = ["GBP", "EUR"] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}
