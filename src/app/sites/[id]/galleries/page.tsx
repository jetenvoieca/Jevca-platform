import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listLocationCustomers } from "@/lib/actions/locations";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import GalleriesView from "@/components/GalleriesView";

// See the matching note on Sales' page.tsx (2026-08-16) — same fix, same
// reason: GalleriesView calls router.refresh() after edits, which needs
// this route to never be served from the Full Route Cache.
export const dynamic = "force-dynamic";

export default async function GalleriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, artist: { select: { name: true, vatRate: true } } },
  });
  if (!site) notFound();

  // Deliberately no "Take payments" gate here, unlike Customers — a
  // gallery is worth tracking (approaching, negotiating, sending
  // consignment) long before any sale has happened, which is the whole
  // point (2026-08-14).
  //
  // Every Location now (2026-09-22 rework) — Gallery and Own alike, not
  // just Gallery — via the new Location model (actions/locations.ts);
  // see the matching note on GalleriesView's own "galleries" prop.
  const galleries = await listLocationCustomers(site.artistId);

  // The "Mark as paid" Method dropdown's payment methods, and (2026-10-27)
  // what a work's Catalogue window needs (ArtworkDetailPanel).
  const settings = await getArtworkSettings(site.artistId);

  return (
    <GalleriesView
      siteId={id}
      artistId={site.artistId}
      artistName={site.artist.name}
      vatRate={site.artist.vatRate != null ? Number(site.artist.vatRate) : null}
      galleries={galleries}
      settings={settings}
    />
  );
}
