import { getLastPublishedAt } from "@/lib/actions/siteSnapshot";
import ArtistAppFrame from "@/components/artist-app/ArtistAppFrame";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { cleanMenuAccess, siteLandingHref, siteNavHref } from "@/lib/siteMenuAccess";
import { listArtistAppPages } from "@/lib/actions/artistApp";
import { arrangePages } from "@/lib/artistAppPageOrder";

// The Artist App's screens, in its frame (checked by the layout above).
// "← Admin" goes to the site in the admin — for a client login (2026-11-10)
// to its first ticked menu item, and not at all if none is ticked; a
// client login also gets Log out. The site's pages are listed beside
// every screen that doesn't show its own side contents (2026-11-11).
export default async function ArtistAppScreensLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const [lastPublishedAt, user, site, pages] = await Promise.all([
    getLastPublishedAt(siteId),
    getCurrentUser(),
    db.site.findUniqueOrThrow({ where: { id: siteId }, select: { artist: { select: { menuAccess: true } } } }),
    listArtistAppPages(siteId),
  ]);
  const isAdmin = user?.role === "ADMIN";
  const adminHref = isAdmin
    ? siteNavHref(siteId, "artworks")
    : siteLandingHref(siteId, cleanMenuAccess(site.artist.menuAccess));
  return (
    <ArtistAppFrame
      siteId={siteId}
      lastPublishedAt={lastPublishedAt?.toISOString() ?? null}
      adminHref={adminHref}
      canLogOut={!isAdmin}
      pages={arrangePages(pages)}
    >
      {children}
    </ArtistAppFrame>
  );
}
