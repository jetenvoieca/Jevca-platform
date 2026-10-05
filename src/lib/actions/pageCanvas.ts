"use server";

import { db } from "@/lib/db";

// A Canvas page's placed curations (2026-10-05) — see PageCanvasItem in
// schema.prisma. Read and saved whole by the Arrange canvas editor
// (CanvasArranger.tsx). Scoped by siteId, and only the site's own
// artist's curations can be placed.

export type CanvasPlacement = { curationId: string; x: number; y: number };

// The furthest a tile can be placed from the canvas's top-left, in
// pixels — far beyond any real layout, just a guard against bad input.
const MAX_COORDINATE = 50000;

function cleanCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_COORDINATE, Math.max(0, Math.round(value))) : 0;
}

export async function getPageCanvas(siteId: string, pageId: string): Promise<CanvasPlacement[]> {
  return db.pageCanvasItem.findMany({
    where: { pageId, page: { siteId } },
    select: { curationId: true, x: true, y: true },
  });
}

// Replaces the page's placements with `placements`. Anything that isn't
// the artist's own curation, or repeats one, is ignored.
export async function savePageCanvas(
  siteId: string,
  pageId: string,
  placements: CanvasPlacement[]
): Promise<{ ok: true } | { error: string }> {
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { site: { select: { artistId: true } } },
  });
  if (!page) return { error: "Page not found." };

  const ids = [...new Set(placements.map((p) => p.curationId))];
  const owned = new Set(
    (
      await db.curation.findMany({
        where: { id: { in: ids }, artistId: page.site.artistId },
        select: { id: true },
      })
    ).map((c) => c.id)
  );

  const seen = new Set<string>();
  const data = placements.flatMap((p) => {
    if (!owned.has(p.curationId) || seen.has(p.curationId)) return [];
    seen.add(p.curationId);
    return [
      { pageId, curationId: p.curationId, x: cleanCoordinate(p.x), y: cleanCoordinate(p.y) },
    ];
  });

  await db.$transaction([
    db.pageCanvasItem.deleteMany({ where: { pageId } }),
    db.pageCanvasItem.createMany({ data }),
  ]);
  return { ok: true };
}
