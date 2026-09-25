import { postJson } from "@/lib/postJson";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import type { StudioPaymentDetails } from "@/lib/studioShared";

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
  // The payment type, from the artist's own list ("" if they have none).
  method: string;
  buyerName: string;
  buyerEmail: string;
};

export function recordSale(token: string, sale: RecordSaleInput) {
  return postJson<{ purchaseId: string }>("/api/studio/record-sale", { token, ...sale });
}

// Starts a sale and returns the Stripe payment link for the buyer.
export function createPaymentLink(token: string, details: StudioPaymentDetails) {
  return postJson<{ purchaseId: string; url: string }>("/api/studio/payment-link", {
    token,
    ...details,
  });
}

// Starts a sale and returns what Stripe's card form needs.
export function startCardPayment(token: string, details: StudioPaymentDetails) {
  return postJson<{
    purchaseId: string;
    clientSecret: string;
    publishableKey: string;
    stripeAccount: string | null;
  }>("/api/studio/card-payment", { token, ...details });
}

// Tells the server a card payment went through, so it can check with
// Stripe and record the sale as paid.
export function confirmCardPayment(token: string, purchaseId: string, paymentIntentId: string) {
  return postJson<{ ok: true }>("/api/studio/confirm-card-payment", {
    token,
    purchaseId,
    paymentIntentId,
  });
}
