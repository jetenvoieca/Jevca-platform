import { NextRequest, NextResponse } from "next/server";
import { recordVideoPoster, videosNeedingPosters } from "@/lib/videoPosters";
import { MEDIA_JOB_SECRET_HEADER, type VideoPosterReport } from "@/lib/mediaJobs";

// For the background function that makes videos' still pictures
// (2026-10-16) — see lib/videoPosters.ts. GET: the next videos waiting
// for one. POST: how one went. Public in the middleware; checked here by
// MEDIA_IMPORT_SECRET.

export const dynamic = "force-dynamic";

const BATCH = 10;

function allowed(request: NextRequest): boolean {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  return !!secret && request.headers.get(MEDIA_JOB_SECRET_HEADER) === secret;
}

export async function GET(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  return NextResponse.json({ videos: await videosNeedingPosters(BATCH) });
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as VideoPosterReport | null;
  if (!body || typeof body.id !== "string" || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  await recordVideoPoster(
    body.id,
    body.ok
      ? { ok: true, posterKey: String(body.posterKey) }
      : { ok: false, error: String(body.error || "Couldn't make a picture.") }
  );
  return NextResponse.json({ ok: true });
}
