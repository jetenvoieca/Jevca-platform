import { NextRequest, NextResponse } from "next/server";
import { findArtistByToken } from "@/lib/studioAuth";
import { SALE_CURRENCIES } from "@/lib/studioShared";
import type { StudioPaymentDetails } from "@/lib/studioShared";

// Shared plumbing for the /api/studio routes: who is calling, and
// checking what they sent.

// At most 99,999,999.99 — what the database's money columns can hold.
const MAX_AMOUNT = 99999999.99;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reads the JSON body and finds the artist its `token` belongs to. Returns
// either the artist and the body's fields, or the error response to send
// straight back.
export async function readStudioRequest(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fields = (body ?? {}) as Record<string, unknown>;

  const artist = await findArtistByToken(fields.token);
  if (!artist) {
    return { response: NextResponse.json({ error: "Invalid token." }, { status: 401 }) };
  }
  return { artist, fields };
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// A money amount above zero, e.g. "450" or "450.50".
export function isValidAmount(value: string): boolean {
  return AMOUNT_PATTERN.test(value) && Number(value) > 0 && Number(value) <= MAX_AMOUNT;
}

export function isValidCurrency(value: string): boolean {
  return (SALE_CURRENCIES as readonly string[]).includes(value);
}

// Checks the fields for taking payment (by card or by link) and returns
// them in their proper shape, or the message to send back.
export function readPaymentDetails(
  fields: Record<string, unknown>
): { details: StudioPaymentDetails } | { error: string } {
  const artworkId = text(fields.artworkId);
  const price = text(fields.price);
  const currency = text(fields.currency);
  const deposit = text(fields.deposit);
  const buyerName = text(fields.buyerName);
  const buyerEmail = text(fields.buyerEmail);

  if (!artworkId) return { error: "artworkId is required." };
  if (!isValidAmount(price)) return { error: "Price must be a number above 0." };
  if (!isValidCurrency(currency)) return { error: "Currency must be GBP or EUR." };
  if (deposit && !AMOUNT_PATTERN.test(deposit)) return { error: "Deposit must be a number." };
  if (!buyerName) return { error: "Customer name is required." };
  if (!EMAIL_PATTERN.test(buyerEmail)) return { error: "A valid email is required." };

  return {
    details: {
      artworkId,
      price,
      currency,
      deposit,
      option: fields.option === "INSTALMENTS" ? "INSTALMENTS" : "FULL",
      source: text(fields.source),
      buyerName,
      buyerEmail,
    },
  };
}
