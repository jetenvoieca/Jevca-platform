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
