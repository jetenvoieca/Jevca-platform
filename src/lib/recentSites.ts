import { db } from "@/lib/db";

// The sites shown under "Sites" in the main menu (2026-10-07). Saved in
// the database (Site.lastVisitedAt), so the list is the same on every
// device — shared by everyone, since the app has one login.
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
