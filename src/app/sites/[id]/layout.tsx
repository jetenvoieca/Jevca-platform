import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countHopper } from "@/lib/actions/hopper";
import { countArtworksNeedingReview } from "@/lib/actions/artworks";
import { countMediaNeedingReview } from "@/lib/actions/mediaCatalogue";
import { getOpenAlerts } from "@/lib/alerts";
import SiteShell from "@/components/SiteShell";
import LastVisitedSiteTracker from "@/components/LastVisitedSiteTracker";
import SiteNameField from "@/components/SiteNameField";

// Without this, Next can treat this layout as static-cacheable (it uses
// no dynamic APIs like cookies()/headers(), just plain db reads) and
// serve stale counts (Hopper, needs-review, alerts, unpublished pages)
// from the Full Route Cache — the site's own Settings page
// (src/app/sites/[id]/page.tsx) already sets this for the same reason.
export const dynamic = "force-dynamic";

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
    artworkNeedsReviewCount,
    mediaNeedsReviewCount,
    openAlerts,
  ] = await Promise.all([
    // Only needed to know whether anything is waiting to be published —
    // every page counts, since publishSite publishes every page.
    db.page.findMany({
      where: { siteId: id },
      select: { draftBlocks: true, liveBlocks: true },
    }),
    countHopper(site.artistId),
    countArtworksNeedingReview(site.artistId),
    countMediaNeedingReview(site.artistId),
    getOpenAlerts(),
  ]);
  const hasUnpublished = pages.some(
    (p) => JSON.stringify(p.draftBlocks) !== JSON.stringify(p.liveBlocks)
  );

  return (
    <>
      <LastVisitedSiteTracker siteId={id} />
      <SiteShell
        siteId={id}
        salesEnabled={site.salesEnabled}
        hopperCount={hopperCount}
        artworkNeedsReviewCount={artworkNeedsReviewCount}
        mediaNeedsReviewCount={mediaNeedsReviewCount}
        alertCount={openAlerts.length}
        hasUnpublished={hasUnpublished}
        header={
          <SiteNameField
            site={{
              id: site.id,
              name: site.name,
              domain: site.domain,
              defaultCurrency: site.defaultCurrency,
              templateId: site.templateId,
              domainStatus: site.domainStatus,
              domainRenewalDate: site.domainRenewalDate,
            }}
            ownerName={site.artist.name}
          />
        }
      >
        {children}
      </SiteShell>
    </>
  );
}
