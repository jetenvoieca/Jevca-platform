import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveUpload, UnreadablePictureError } from "@/lib/mediaUpload";

// One exhibition from an artist's old ISYT site (2026-11-02), sent by the
// browser importer's "Import this ISYT site" — see Exhibition in
// schema.prisma. Authenticated by the artist's hopperToken, like the rest
// of /api/hopper/*. Its picture, if any, was first PUT to the address
// from /api/hopper/request-upload (`key`); it goes straight into the
// Media Catalogue (not the Hopper) as the exhibition's main picture.
// Dates are "YYYY-MM-DD" or blank. No venue: it's chosen afterwards from
// the artist's Locations. An exhibition already imported (`sourceUrl`)
// isn't imported again.
const MAX_TEXT = 10000;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function day(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const token = text(body.token);
  const sourceUrl = text(body.sourceUrl, 2000);
  if (!token || !sourceUrl) {
    return NextResponse.json({ error: "token and sourceUrl are required." }, { status: 400 });
  }
  const artist = await db.artist.findUnique({ where: { hopperToken: token }, select: { id: true } });
  if (!artist) return NextResponse.json({ error: "Invalid token." }, { status: 401 });

  const existing = await db.exhibition.findUnique({
    where: { artistId_sourceUrl: { artistId: artist.id, sourceUrl } },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ id: existing.id, alreadyImported: true });

  const name = text(body.name, 300);
  const key = text(body.key, 500);
  const contentType = text(body.contentType, 100);

  let imageId: string | null = null;
  if (key) {
    // A key issued for another artist is refused (see createUploadUrl).
    if (!key.startsWith(`${artist.id}/`) || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "That picture doesn't belong to this artist." }, { status: 400 });
    }
    try {
      const saved = await saveUpload(artist.id, key, contentType, "PHOTO", {
        rejectUnreadable: true,
        status: "SORTED",
        source: "Website import",
        caption: name || undefined,
        sourceUrl,
      });
      imageId = saved.image.id;
    } catch (err) {
      if (err instanceof UnreadablePictureError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
  }

  const created = await db.exhibition.create({
    data: {
      artistId: artist.id,
      name,
      startDate: day(body.startDate),
      endDate: day(body.endDate),
      openingTimes: text(body.openingTimes),
      description: text(body.description),
      sourceUrl,
      ...(imageId ? { images: { create: { imageId, position: 0 } } } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id });
}
