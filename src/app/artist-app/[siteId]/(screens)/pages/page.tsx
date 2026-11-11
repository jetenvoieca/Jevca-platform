import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { artistAppPageHref } from "@/lib/artistApp";
import { getArtistAppPageContent, listArtistAppPages } from "@/lib/actions/artistApp";
import { readLocations } from "@/lib/artworkSettingsData";
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
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      artistId: true,
      // The client's Profile, for a Profile page's Profile tile.
      artist: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          addressLine1: true,
          city: true,
          postcode: true,
          country: true,
          instagramHandle: true,
          facebookUrl: true,
          logoUrl: true,
        },
      },
    },
  });
  const pages = arrangePages(await listArtistAppPages(siteId));
  const chosen = pages.find((p) => p.id === page) ?? pages[0];
  const firstId = chosen ? pageToOpen(pages, chosen.id) : null;
  if (firstId && firstId !== page) redirect(artistAppPageHref(siteId, firstId));
  const content = firstId ? await getArtistAppPageContent(siteId, firstId) : null;
  // For the Galleries entry's window (a Profile page's entries open theirs).
  const galleries = (await readLocations(site!.artistId)).filter((l) => l.type === "GALLERY");

  return (
    <ArtistPagesView
      siteId={siteId}
      artistId={site!.artistId}
      pages={pages}
      firstPageId={firstId}
      firstContent={content}
      galleries={galleries.map((g) => ({ id: g.id, name: g.name }))}
      profile={site!.artist}
    />
  );
}
