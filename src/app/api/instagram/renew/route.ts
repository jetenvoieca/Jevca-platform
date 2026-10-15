import { NextResponse, type NextRequest } from "next/server";
import { renewInstagramConnections } from "@/lib/instagramRenewal";

// The daily Instagram renewal (2026-10-15) — see lib/instagramRenewal.ts.
// Called by netlify/functions/renew-instagram.mts. Only callers with
// INSTAGRAM_RENEW_SECRET get in (this route is outside the login, see
// middleware.ts).

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.INSTAGRAM_RENEW_SECRET;
  if (!secret || request.headers.get("x-instagram-renew-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await renewInstagramConnections());
}
