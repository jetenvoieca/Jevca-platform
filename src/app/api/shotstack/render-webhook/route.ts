import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { readTimeline } from "@/lib/videoTimeline";
import { uploadToR2 } from "@/lib/r2";

function shotstackHost(env: string) {
  return `https://api.shotstack.io/edit/${env}`;
}
function apiKeyFor(env: string): string {
  return env === "v1"
    ? process.env.SHOTSTACK_API_KEY_PRODUCTION!
    : process.env.SHOTSTACK_API_KEY_STAGE!;
}

// Shotstack does not sign its webhook payloads (confirmed directly in
// their own docs) — anyone could POST to this public endpoint. So this
// never trusts the POST body for anything beyond "which render does this
// concern" — it always re-queries Shotstack's own API with our API key
// to get the real, trustworthy status and URL before doing anything,
// exactly as Shotstack's own docs recommend.
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const shotstackId = payload?.id as string | undefined;
  if (!shotstackId) return NextResponse.json({ ok: true });

  const render = await db.videoRender.findFirst({ where: { shotstackRenderId: shotstackId } });
  if (!render || !render.renderEnv) return NextResponse.json({ ok: true });

  const statusRes = await fetch(`${shotstackHost(render.renderEnv)}/render/${shotstackId}`, {
    headers: { "x-api-key": apiKeyFor(render.renderEnv) },
  });
  const statusBody = await statusRes.json().catch(() => null);
  const confirmed = statusBody?.response;
  if (!confirmed) return NextResponse.json({ ok: true });

  if (confirmed.status === "failed") {
    await db.videoRender.update({
      where: { id: render.id },
      data: { status: "FAILED", renderError: confirmed.error || "Render failed." },
    });
    return NextResponse.json({ ok: true });
  }

  if (confirmed.status !== "done") {
    // Still queued / fetching / rendering / saving — just reflect that
    // something is happening and wait for the next callback.
    if (render.status !== "RENDERING") {
      await db.videoRender.update({ where: { id: render.id }, data: { status: "RENDERING" } });
    }
    return NextResponse.json({ ok: true });
  }

  // Done — download the file from Shotstack's own confirmed URL (never
  // the URL out of the unsigned POST body) and re-host it in our own
  // R2, consistent with everything else in the Media Catalogue.
  const videoRes = await fetch(confirmed.url);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const key = `${render.artistId}/renders/${randomUUID()}.mp4`;
  await uploadToR2(key, bytes, "video/mp4");

  const image = await db.image.create({
    data: {
      artistId: render.artistId,
      key,
      url: `/api/media/${key}`,
      kind: "VIDEO",
      mimeType: "video/mp4",
      status: "SORTED",
      source: "Video Editor",
    },
  });

  // The clips actually used in this render move from Bucket to ordinary
  // Sorted media too — they stay in the Media Catalogue in their own
  // right, not consumed by this one video (bucket-video-editor-design.md).
  const timeline = readTimeline(render.timeline);
  const usedImageIds = [...new Set(timeline.clips.map((c) => c.imageId))];
  if (usedImageIds.length > 0) {
    await db.image.updateMany({
      where: { id: { in: usedImageIds }, status: "BUCKET" },
      data: { status: "SORTED" },
    });
  }

  await db.videoRender.update({
    where: { id: render.id },
    data: { status: "DONE", resultImageId: image.id },
  });

  return NextResponse.json({ ok: true });
}
