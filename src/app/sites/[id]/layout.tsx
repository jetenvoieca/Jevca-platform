import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countHopper, countBucket } from "@/lib/actions/hopper";
import { countArtworksNeedingReview } from "@/lib/actions/artworks";
import { countMediaNeedingReview } from "@/lib/actions/mediaCatalogue";
import { getOpenAlerts } from "@/lib/alerts";
import SiteShell from "@/components/SiteShell";
import LastVisitedSiteTracker from "@/components/LastVisitedSiteTracker";
import SiteNameField from "@/components/SiteNameField";

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
      // Excludes auto-created Pavilion child pages (sourceTag: "pavilion",
      // 2026-08-30) from this sidebar — each one is still a real Page (so
      // it can be opened, filled in, or added to a Menu by hand later),
      // just not listed here too, or the sidebar would grow by one entry
      // per Pavilion card.
      //
      // BUG FIXED 2026-08-30: originally written as
      // `sourceTag: { not: "pavilion" }`, which excluded every ordinary
      // page too — every page has sourceTag left empty (null), and "not
      // equal to pavilion" doesn't reliably include empty values, so
      // the entire sidebar list came back near-empty right after this
      // filter shipped (pages weren't actually deleted, just no longer
      // listed — but with no way to open them, understandably looked
      // exactly like data loss). Written explicitly as an OR now so
      // "untagged" is always unambiguously included, regardless of how
      // any particular query engine treats an empty value in a "not
      // equal" comparison.
      where: { siteId: id, OR: [{ sourceTag: null }, { sourceTag: { not: "pavilion" } }] },
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
    <>
      <LastVisitedSiteTracker siteId={id} />
      <SiteShell
        siteId={id}
        // Falls back to the artist's name for the rare site with no
        // name of its own (2026-09-02, direct request) — the nav
        // section needs a label either way.
        siteLabel={site.name.trim() || site.artist.name}
        pages={pages.map((p) => ({ id: p.id, title: p.title, type: p.type, visible: p.visible }))}
        salesEnabled={site.salesEnabled}
        hopperCount={hopperCount}
        bucketCount={bucketCount}
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
              template: site.template,
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
