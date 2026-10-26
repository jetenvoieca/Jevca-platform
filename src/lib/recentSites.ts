import { db } from "@/lib/db";

// The sites shown under "Sites" in the main menu (2026-10-07). Saved in
// the database (Site.lastVisitedAt), so the list is the same on every
// device. The admin's (an artist login sees their own sites instead —
// getClientSites).
export const RECENT_SITES_COUNT = 2;

export type RecentSite = { id: string; label: string };

// Most recently opened sites, newest first, labelled by owner name (as
// in the Sites list). `excludeSiteId` leaves out the site currently
// open, which the per-site menu adds itself.
export async function getRecentSites({
  excludeSiteId,
  take = RECENT_SITES_COUNT,
}: { excludeSiteId?: string; take?: number } = {}): Promise<RecentSite[]> {
  const sites = await db.site.findMany({
    where: {
      lastVisitedAt: { not: null },
      ...(excludeSiteId ? { id: { not: excludeSiteId } } : {}),
    },
    select: { id: true, artist: { select: { name: true } } },
    relationLoadStrategy: "query",
    orderBy: { lastVisitedAt: "desc" },
    take,
  });
  return sites.map((s) => ({ id: s.id, label: s.artist.name }));
}

// Records that a site was just opened. Plain SQL so a visit doesn't
// change Site.updatedAt (Prisma's @updatedAt would), which should only
// move when the site itself is edited.
export async function recordSiteVisit(siteId: string): Promise<void> {
  await db.$executeRaw`UPDATE "Site" SET "lastVisitedAt" = NOW() WHERE "id" = ${siteId}`;
}

// A client's own sites but one (2026-10-26 — the "Sites" an artist login
// sees in the menu), labelled by site name, archived ones left out.
export async function getClientSites(artistId: string, excludeSiteId: string): Promise<RecentSite[]> {
  const sites = await db.site.findMany({
    where: { artistId, id: { not: excludeSiteId }, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return sites.map((s) => ({ id: s.id, label: s.name }));
}
