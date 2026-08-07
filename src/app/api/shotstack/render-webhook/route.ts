import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { readTimeline } from "@/lib/videoTimeline";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";

function shotstackHost(env: string) {
  return `https://api.shotstack.io/edit/${env}`;
}
function apiKeyFor(env: string): string {
  return env === "v1"
    ? process.env.SHOTSTACK_API_KEY_PRODUCTION!
    : process.env.SHOTSTACK_API_KEY_STAGE!;
}

async function cleanUpTempAssets(tempAssetKeys: string[]): Promise<void> {
  if (tempAssetKeys.length === 0) return;
  await Promise.all(tempAssetKeys.map((key) => deleteFromR2(key).catch(() => {})));
}

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
    await cleanUpTempAssets(render.tempAssetKeys);
    return NextResponse.json({ ok: true });
  }

  if (confirmed.status !== "done") {
    if (render.status !== "RENDERING") {
      await db.videoRender.update({ where: { id: render.id }, data: { status: "RENDERING" } });
    }
    return NextResponse.json({ ok: true });
  }

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

  await cleanUpTempAssets(render.tempAssetKeys);

  return NextResponse.json({ ok: true });
}
