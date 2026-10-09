// Artist or brand (2026-10-09). A client's kind is chosen when the client
// is created and never changes. Both kinds work the same way; only the
// words differ. Every screen that names a client, an artwork/product or
// a gallery/store takes its wording from here, so the two never drift.

export type ClientKind = "ARTIST" | "BRAND";

export const CLIENT_KINDS: ClientKind[] = ["ARTIST", "BRAND"];

export type ClientWords = {
  client: string; // "Artist" / "Brand"
  item: string; // "Artwork" / "Product"
  items: string; // "Artworks" / "Products"
  catalogue: string; // "Artwork Catalogue" / "Product Catalogue"
  location: string; // "Gallery" / "Store"
  locations: string; // "Galleries" / "Stores"
  cataloguePrefix: string; // "AW" / "PR"
};

const WORDS: Record<ClientKind, ClientWords> = {
  ARTIST: {
    client: "Artist",
    item: "Artwork",
    items: "Artworks",
    catalogue: "Artwork Catalogue",
    location: "Gallery",
    locations: "Galleries",
    cataloguePrefix: "AW",
  },
  BRAND: {
    client: "Brand",
    item: "Product",
    items: "Products",
    catalogue: "Product Catalogue",
    location: "Store",
    locations: "Stores",
    cataloguePrefix: "PR",
  },
};

export function clientWords(kind: ClientKind): ClientWords {
  return WORDS[kind];
}

// For values arriving from a form — anything unrecognised is null, never
// silently treated as one kind or the other.
export function parseClientKind(value: unknown): ClientKind | null {
  return value === "ARTIST" || value === "BRAND" ? value : null;
}
