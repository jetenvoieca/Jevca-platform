import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// The catalogue sorted by Curation (2026-11-06, Craig's request — to help
// tidying): curations A–Z, each in its own order, then the works in no
// curation, A–Z. A work in several curations comes under the first of
// them (A–Z), once. Worked out over the whole filtered set, as a database
// can't sort by it, so the grid's pages and the PDF/CSV exports follow
// the same order. Plain server module (not "use server").

// Every work matching `where`, as ids in that order.
export async function orderByCuration(where: Prisma.ArtworkWhereInput): Promise<string[]> {
  const works = await db.artwork.findMany({
    where,
    // The name order the works in no curation keep (natural collation).
    orderBy: [{ catalogueName: "asc" }, { createdAt: "asc" }],
    select: { id: true, curationItems: { select: { position: true, curation: { select: { name: true } } } } },
  });
  const placed = works.map((w, nameOrder) => {
    const first = [...w.curationItems].sort((a, b) => a.curation.name.localeCompare(b.curation.name))[0];
    return { id: w.id, curation: first?.curation.name ?? null, position: first?.position ?? 0, nameOrder };
  });
  placed.sort((a, b) => {
    if (a.curation !== b.curation) {
      if (a.curation === null) return 1;
      if (b.curation === null) return -1;
      return a.curation.localeCompare(b.curation);
    }
    return a.curation === null ? a.nameOrder - b.nameOrder : a.position - b.position || a.nameOrder - b.nameOrder;
  });
  return placed.map((p) => p.id);
}

// `rows` (each with an id) in the order of `ids`.
export function inIdOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const index = new Map(ids.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}
