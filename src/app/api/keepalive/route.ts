import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Pinged every 5 minutes by the Netlify scheduled function at
// netlify/functions/keep-warm.mts. Two jobs in one request:
//  1. Hitting any route in this app invokes the same bundled Next.js
//     server function that handles everything else, so a regular ping
//     here keeps that function warm and avoids the ~3s cold-start cost
//     reported 2026-08-12.
//  2. The trivial query below keeps the Neon database compute awake too,
//     avoiding its own separate wake-up cost (confirmed as a real,
//     distinct contributor in the same session — see decisions log).
// Not user-facing; no auth needed since it does nothing but read one row.
export async function GET() {
  await db.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export const dynamic = "force-dynamic";
