import { NextRequest, NextResponse } from "next/server";
import { isValidAmount, isValidCurrency, readStudioRequest, text } from "@/lib/studioRequest";
import { recordStudioSale } from "@/lib/studioSales";

// Records a sale the artist has already been paid for. Authenticated by
// the artist's personal token, and only ever touches that artist's own
// artworks.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const artworkId = text(fields.artworkId);
  const totalAmount = text(fields.totalAmount);
  const currency = text(fields.currency);
  const saleDate = text(fields.saleDate);
  const buyerName = text(fields.buyerName);

  if (!artworkId) {
    return NextResponse.json({ error: "artworkId is required." }, { status: 400 });
  }
  if (!isValidAmount(totalAmount)) {
    return NextResponse.json({ error: "Price must be a number above 0." }, { status: 400 });
  }
  if (!isValidCurrency(currency)) {
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
    method: text(fields.method),
    buyerName,
    buyerEmail: text(fields.buyerEmail),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
