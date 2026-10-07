import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countHopper } from "@/lib/actions/hopper";
import { countArtworksNeedingReview } from "@/lib/actions/artworks";
import { countMediaNeedingReview } from "@/lib/actions/mediaCatalogue";
import { getLastPublishedAt } from "@/lib/actions/siteSnapshot";
import { getOpenAlerts } from "@/lib/alerts";
import { getRecentSites, recordSiteVisit } from "@/lib/recentSites";
import SiteShell from "@/components/SiteShell";
import SiteNameField from "@/components/SiteNameField";

// Without this, Next can treat this layout as static-cacheable (it uses
// no dynamic APIs like cookies()/headers(), just plain db reads) and
// serve stale counts (Hopper, needs-review, alerts) from the Full Route
// Cache — the site's own Settings page (src/app/sites/[id]/page.tsx)
// already sets this for the same reason.
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

  // Opening a site records the visit (Site.lastVisitedAt). The recent
  // sites under "Sites" in the menu are this site, then the one opened
  // before it.
  const [
    hopperCount,
    artworkNeedsReviewCount,
    mediaNeedsReviewCount,
    openAlerts,
    lastPublishedAt,
    previousSites,
  ] = await Promise.all([
    countHopper(site.artistId),
    countArtworksNeedingReview(site.artistId),
    countMediaNeedingReview(site.artistId),
    getOpenAlerts(),
    getLastPublishedAt(id),
    getRecentSites({ excludeSiteId: id, take: 1 }),
    recordSiteVisit(id),
  ]);
  const recentSites = [{ id, label: site.artist.name }, ...previousSites];

  return (
    <SiteShell
      siteId={id}
      salesEnabled={site.salesEnabled}
      hopperCount={hopperCount}
      artworkNeedsReviewCount={artworkNeedsReviewCount}
      mediaNeedsReviewCount={mediaNeedsReviewCount}
      alertCount={openAlerts.length}
      lastPublishedAt={lastPublishedAt?.toISOString() ?? null}
      recentSites={recentSites}
      header={
        <div className="flex items-start justify-between gap-4">
          <SiteNameField
            site={{
              id: site.id,
              name: site.name,
              domain: site.domain,
              defaultCurrency: site.defaultCurrency,
              domainStatus: site.domainStatus,
              domainRenewalDate: site.domainRenewalDate,
            }}
            ownerName={site.artist.name}
          />
          {/* The site as last published (2026-10-06), in a new tab. */}
          <a
            href={`/site-preview/${site.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            View published site ↗
          </a>
        </div>
      }
    >
      {children}
    </SiteShell>
  );
}
