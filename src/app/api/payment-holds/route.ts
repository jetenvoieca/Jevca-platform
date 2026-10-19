import { NextResponse } from "next/server";
import { releaseExpiredHolds } from "@/lib/paymentHolds";

// Releases website buyers' holds that have run out (2026-10-19) — see
// lib/paymentHolds.ts. Called every 10 minutes by
// netlify/functions/release-payment-holds.mts. Public in the middleware
// and needs no secret: it only ever cancels holds whose time is up, which
// is safe whoever asks.

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ released: await releaseExpiredHolds() });
}
