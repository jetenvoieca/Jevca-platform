import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { artistAppPageHref } from "@/lib/artistApp";
import { getArtistAppPageWorks, listArtistAppPages } from "@/lib/actions/artistApp";
import { arrangePages, pageToOpen } from "@/lib/artistAppPageOrder";
import ArtistPagesView from "@/components/artist-app/ArtistPagesView";

export const dynamic = "force-dynamic";

// Arrange Pages (2026-11-08, Craig's mockup): the site's Live and Hidden
// pages, and the works of the chosen one — the address's `page` (kept
// there for the frame's preview eye, and to come back to from a
// preview), the first Live page to start.
export default async function ArtistPagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { siteId } = await params;
  const { page } = await searchParams;
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  const pages = arrangePages(await listArtistAppPages(siteId));
  const chosen = pages.find((p) => p.id === page) ?? pages[0];
  const firstId = chosen ? pageToOpen(pages, chosen.id) : null;
  if (firstId && firstId !== page) redirect(artistAppPageHref(siteId, firstId));
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
