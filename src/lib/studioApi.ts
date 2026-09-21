import { postJson } from "@/lib/postJson";
import type { StudioArtworkTile } from "@/lib/studioArtworks";

// Browser-side calls to the token-authenticated /api/studio routes.

export function fetchStudioArtworks(token: string, q: string, offset: number) {
  return postJson<{ artworks: StudioArtworkTile[]; total: number }>("/api/studio/artworks", {
    token,
    q,
    offset,
  });
}

export function consignArtwork(token: string, artworkId: string, location: string) {
  return postJson<{ location: string }>("/api/studio/consign", { token, artworkId, location });
}

export type RecordSaleInput = {
  artworkId: string;
  totalAmount: string;
  currency: string;
  // YYYY-MM-DD
  saleDate: string;
  source: string;
  buyerName: string;
  buyerEmail: string;
};

export function recordSale(token: string, sale: RecordSaleInput) {
  return postJson<{ purchaseId: string }>("/api/studio/record-sale", { token, ...sale });
}
