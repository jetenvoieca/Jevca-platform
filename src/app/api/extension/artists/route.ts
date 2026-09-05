import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Powers the "Hopper Importer" browser extension's artist/token picker
// (2026-09-05). Deliberately NOT in middleware.ts's PUBLIC_PATH_PREFIXES
// — unlike /api/hopper/* (authenticated by an individual artist's own
// hopperToken), this endpoint hands back every artist's token at once,
// so it stays behind the normal login wall. The extension only ever
// reaches it via a content script running on this app's own domain
// (where the browser already holds a valid session cookie), never via a
// direct cross-site fetch from the extension itself.
//
// Returns every non-archived artist's name alongside their Hopper
// Token, so the extension can offer a "which artist am I importing for"
// dropdown instead of Craig pasting tokens in by hand — see the note on
// hopperToken in schema.prisma and /api/hopper/request-upload.
export async function GET() {
  const artists = await db.artist.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, hopperToken: true },
  });
  return NextResponse.json({ artists });
}
