import { db } from "@/lib/db";
import { getArtistAppPageWorks, listArtistAppPages } from "@/lib/actions/artistApp";
import { arrangePages, pageToOpen } from "@/lib/artistAppPageOrder";
import ArtistPagesView from "@/components/artist-app/ArtistPagesView";

export const dynamic = "force-dynamic";

// Arrange Pages (2026-11-08, Craig's mockup): the site's Live and Hidden
// pages, and the works of the chosen one (the first Live page to start).
export default async function ArtistPagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  const pages = arrangePages(await listArtistAppPages(siteId));
  const firstId = pages[0] ? pageToOpen(pages, pages[0].id) : null;
  const works = firstId ? await getArtistAppPageWorks(siteId, firstId) : null;

  return (
    <ArtistPagesView
      siteId={siteId}
      artistId={site!.artistId}
      pages={pages}
      firstPageId={firstId}
      firstWorks={works}
    />
  );
}
