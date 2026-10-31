import { NextRequest, NextResponse } from "next/server";
import { findArtistByToken } from "@/lib/studioAuth";

// Shared plumbing for the /api/studio routes: who is calling, and
// checking what they sent.

// At most 99,999,999.99 — what the database's money columns can hold.
const MAX_AMOUNT = 99999999.99;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

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

// A date as a date field sends it, e.g. "2026-09-26".
export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Text the app may leave out: trimmed, or null when none was sent (an
// edition number is sent only for an edition, to be saved; null leaves it
// as it is).
export function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}
