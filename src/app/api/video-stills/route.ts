import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { finalizeUpload } from "@/lib/actions/media";
import { MEDIA_JOB_SECRET_HEADER, type VideoStillReport } from "@/lib/mediaJobs";

// For the background function taking Video Edit's stills (2026-10-17) —
// see grabVideoStill in lib/actions/videoEditor.ts. A still taken is put
// in the artist's Hopper, its sizes made like any uploaded picture.
// Public in the middleware; checked here by MEDIA_IMPORT_SECRET.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret || request.headers.get(MEDIA_JOB_SECRET_HEADER) !== secret) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const report = (await request.json().catch(() => null)) as VideoStillReport | null;
  if (!report || typeof report.artistId !== "string" || typeof report.ok !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!report.ok) return NextResponse.json({ ok: true });
  const key = String(report.key);
  const artist = await db.artist.findUnique({ where: { id: report.artistId }, select: { id: true } });
  if (!artist || !key.startsWith(`${artist.id}/`))
    return NextResponse.json({ error: "Unknown artist." }, { status: 400 });

  await finalizeUpload(artist.id, key, "image/jpeg", "PHOTO", {
    status: "HOPPER",
    source: "Video still",
    caption: String(report.caption || "").slice(0, 200),
  });
  return NextResponse.json({ ok: true });
}
