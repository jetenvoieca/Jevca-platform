import { postJson } from "@/lib/postJson";
import type { StudioArtworkTile } from "@/lib/studioArtworks";

// Browser-side calls to the token-authenticated /api/studio routes.

// One page of the artist's unsold artworks, from `offset`.
export function fetchStudioArtworks(token: string, offset: number) {
  return postJson<{ artworks: StudioArtworkTile[]; total: number }>("/api/studio/artworks", {
    token,
    offset,
  });
}

export type ConsignInput = {
  artworkId: string;
  location: string;
  // The agreed price, as a plain number string, and its currency.
  price: string;
  currency: string;
  // The edition number to save ("" clears it), or null to leave it as it
  // is — only an edition-type artwork sends one.
  edition: string | null;
};

export function consignArtwork(token: string, consignment: ConsignInput) {
  return postJson<{ location: string }>("/api/studio/consign", { token, ...consignment });
}

export type RecordSaleInput = {
  artworkId: string;
  totalAmount: string;
  currency: string;
  // YYYY-MM-DD
  saleDate: string;
  source: string;
  // The payment type, from the artist's own list ("" if they have none).
  method: string;
  buyerName: string;
  buyerEmail: string;
};

export function recordSale(token: string, sale: RecordSaleInput) {
  return postJson<{ purchaseId: string }>("/api/studio/record-sale", { token, ...sale });
}

// Sends the Instructions text to the artist's Hopper.
export function sendInstructions(token: string, text: string) {
  return postJson<{ ok: true }>("/api/studio/instructions", { token, text });
}
