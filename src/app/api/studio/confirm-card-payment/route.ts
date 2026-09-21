import { NextRequest, NextResponse } from "next/server";
import { readStudioRequest, text } from "@/lib/studioRequest";
import { confirmStudioCardPayment } from "@/lib/studioSales";

// Called once a card payment went through in the browser. Checks it with
// Stripe before recording the sale as paid. Authenticated by the artist's
// personal token.
export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const purchaseId = text(fields.purchaseId);
  const paymentIntentId = text(fields.paymentIntentId);
  if (!purchaseId || !paymentIntentId) {
    return NextResponse.json(
      { error: "purchaseId and paymentIntentId are required." },
      { status: 400 }
    );
  }

  const result = await confirmStudioCardPayment(artist, purchaseId, paymentIntentId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
