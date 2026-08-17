import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publishSite } from "@/lib/actions/pages";
import { logout } from "@/lib/actions/auth";
import { countHopper, countBucket } from "@/lib/actions/hopper";
import { countArtworksNeedingReview } from "@/lib/actions/artworks";
import { countMediaNeedingReview } from "@/lib/actions/mediaCatalogue";
import { getOpenAlerts } from "@/lib/alerts";
import SiteNavPanel from "@/components/SiteNavPanel";
import LastVisitedSiteTracker from "@/components/LastVisitedSiteTracker";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({
    where: { id },
    include: { artist: true },
    relationLoadStrategy: "query",
  });
  if (!site) notFound();

  const [
    pages,
    hopperCount,
    bucketCount,
    artworkNeedsReviewCount,
    mediaNeedsReviewCount,
    openAlerts,
  ] = await Promise.all([
    db.page.findMany({
      where: { siteId: id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        visible: true,
        draftBlocks: true,
        liveBlocks: true,
      },
    }),
    countHopper(site.artistId),
    countBucket(site.artistId),
    countArtworksNeedingReview(site.artistId),
    countMediaNeedingReview(site.artistId),
    getOpenAlerts(),
  ]);
  const hasUnpublished = pages.some(
    (p) => JSON.stringify(p.draftBlocks) !== JSON.stringify(p.liveBlocks)
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <LastVisitedSiteTracker siteId={id} />
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{site.name}</h1>
          <p className="text-sm text-neutral-500">Owner: {site.artist.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <form action={publishSite.bind(null, id)}>
            <button
              type="submit"
              disabled={!hasUnpublished}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:hover:bg-neutral-200"
            >
              Publish to live site
            </button>
          </form>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              Log out
            </button>
          </form>
        </div>
      </div>

      {/* Standing layout rule (2026-08-03): independently-scrolling
          columns, fixed headers — this per-site shell had never actually
          been retrofitted to it (only AppShell.tsx and SitesDirectoryView
          had). Each column below scrolls on its own; the header above
          stays pinned regardless of how far either column scrolls. */}
      <div className="grid flex-1 grid-cols-[1fr_220px] overflow-hidden">
        <div className="h-full overflow-y-auto">{children}</div>
        <div className="h-full overflow-y-auto border-l border-neutral-200 p-4">
          <SiteNavPanel
            siteId={id}
            pages={pages.map((p) => ({ id: p.id, title: p.title, type: p.type, visible: p.visible }))}
            salesEnabled={site.salesEnabled}
            hopperCount={hopperCount}
            bucketCount={bucketCount}
            artworkNeedsReviewCount={artworkNeedsReviewCount}
            mediaNeedsReviewCount={mediaNeedsReviewCount}
            alertCount={openAlerts.length}
          />
        </div>
      </div>
    </div>
  );
}
