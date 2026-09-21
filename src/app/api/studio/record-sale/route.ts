import { NextRequest, NextResponse } from "next/server";
import { findArtistByToken } from "@/lib/studioAuth";
import { recordStudioSale } from "@/lib/studioSales";
import { SALE_CURRENCIES } from "@/lib/studioShared";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Records a sale the artist has already been paid for. Authenticated by
// the artist's personal token, and only ever touches that artist's own
// artworks.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fields = (body ?? {}) as Record<string, unknown>;

  const artist = await findArtistByToken(fields.token);
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const artworkId = text(fields.artworkId);
  const totalAmount = text(fields.totalAmount);
  const currency = text(fields.currency);
  const saleDate = text(fields.saleDate);
  const buyerName = text(fields.buyerName);

  if (!artworkId) {
    return NextResponse.json({ error: "artworkId is required." }, { status: 400 });
  }
  // At most 99,999,999.99 — what the database column can hold.
  if (
    !/^\d+(\.\d{1,2})?$/.test(totalAmount) ||
    Number(totalAmount) <= 0 ||
    Number(totalAmount) > 99999999.99
  ) {
    return NextResponse.json({ error: "Price must be a number above 0." }, { status: 400 });
  }
  if (!(SALE_CURRENCIES as readonly string[]).includes(currency)) {
    return NextResponse.json({ error: "Currency must be GBP or EUR." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return NextResponse.json({ error: "Date is required." }, { status: 400 });
  }
  if (!buyerName) {
    return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  }

  const result = await recordStudioSale(artist, {
    artworkId,
    totalAmount,
    currency,
    saleDate,
    source: text(fields.source),
    buyerName,
    buyerEmail: text(fields.buyerEmail),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
