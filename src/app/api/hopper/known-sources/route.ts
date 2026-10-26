import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Which of these old-website addresses this artist already has
// (2026-10-26) — asked by the browser importer before it sends anything,
// so a work imported once isn't imported again (see the note on
// Image.sourceUrl in schema.prisma). Authenticated by the artist's
// hopperToken, like the rest of /api/hopper/*.
const MAX_SOURCES = 2000;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string; sourceUrls?: unknown } | null;
  const token = body?.token;
  const sourceUrls = Array.isArray(body?.sourceUrls)
    ? body.sourceUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : null;
  if (!token || !sourceUrls) {
    return NextResponse.json({ error: "token and sourceUrls are required." }, { status: 400 });
  }
  if (sourceUrls.length > MAX_SOURCES) {
    return NextResponse.json({ error: `At most ${MAX_SOURCES} addresses at a time.` }, { status: 400 });
  }

  const artist = await db.artist.findUnique({ where: { hopperToken: token }, select: { id: true } });
  if (!artist) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const rows = await db.image.findMany({
    where: { artistId: artist.id, sourceUrl: { in: sourceUrls } },
    select: { sourceUrl: true },
  });
  return NextResponse.json({ known: [...new Set(rows.map((r) => r.sourceUrl))] });
}
