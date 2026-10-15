import { NextRequest, NextResponse } from "next/server";
import { finishHopperVideoImport } from "@/lib/hopperVideoImport";
import { MEDIA_IMPORT_SECRET_HEADER, type VideoCopyReport } from "@/lib/hopperVideoCopy";

// The background function's report on one video it copied for the
// Hopper's CSV import (2026-10-15) — see lib/hopperVideoImport.ts. Public
// in the middleware (under /api/hopper); checked here by
// MEDIA_IMPORT_SECRET.
export async function POST(request: NextRequest) {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret || request.headers.get(MEDIA_IMPORT_SECRET_HEADER) !== secret) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as VideoCopyReport | null;
  if (!body || typeof body.importId !== "string" || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  await finishHopperVideoImport(
    body.importId,
    body.ok ? { ok: true } : { ok: false, error: String(body.error || "Could not copy the video.") }
  );
  return NextResponse.json({ ok: true });
}
