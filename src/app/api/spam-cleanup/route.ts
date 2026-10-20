import { NextResponse } from "next/server";
import { deleteOldSpam } from "@/lib/spamFilter";

// Deletes spam older than 30 days (2026-10-20) — see lib/spamFilter.ts.
// Called daily by netlify/functions/clear-old-spam.mts. Public in the
// middleware and needs no secret: it only ever deletes spam whose time is
// up, which is safe whoever asks.

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ deleted: await deleteOldSpam() });
}
