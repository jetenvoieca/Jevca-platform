import { NextRequest, NextResponse } from "next/server";
import { readPaymentDetails, readStudioRequest } from "@/lib/studioRequest";
import { startStudioPaymentLink } from "@/lib/studioSales";

// Starts a sale for one of the artist's artworks and creates the Stripe
// payment link for the buyer to pay. Authenticated by the artist's
// personal token.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const parsed = readPaymentDetails(fields);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await startStudioPaymentLink(artist, parsed.details);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
