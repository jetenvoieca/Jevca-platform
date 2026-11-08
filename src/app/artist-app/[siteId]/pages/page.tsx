import { db } from "@/lib/db";
import { getArtistAppPageWorks, listArtistAppPages } from "@/lib/actions/artistApp";
import { arrangePages } from "@/lib/artistAppPageOrder";
import ArtistPagesView from "@/components/artist-app/ArtistPagesView";

export const dynamic = "force-dynamic";

// Arrange Pages (2026-11-08, Craig's mockup): the site's Live and Hidden
// pages, and the works of the chosen one (the first Live page to start).
export default async function ArtistPagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  const pages = arrangePages(await listArtistAppPages(siteId));
  const first = pages[0] ?? null;
  const works = first ? await getArtistAppPageWorks(siteId, first.id) : null;

  return (
    <ArtistPagesView
      siteId={siteId}
      artistId={site!.artistId}
      pages={pages}
      firstPageId={first?.id ?? null}
      firstWorks={works}
    />
  );
}
