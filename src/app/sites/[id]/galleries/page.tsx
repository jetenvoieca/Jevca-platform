import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listGalleries } from "@/lib/actions/customers";
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
    select: { artistId: true },
  });
  if (!site) notFound();

  // Deliberately no "Take payments" gate here, unlike Customers — a
  // gallery is worth tracking (approaching, negotiating, sending
  // consignment) long before any sale has happened, which is the whole
  // point (2026-08-14).
  const galleries = await listGalleries(site.artistId);

  // Just the paymentMethods list is actually needed here (the "Mark as
  // paid" Method dropdown, 2026-09-03) — reusing getArtworkSettings
  // rather than a separate one-off query, since it already fetches this
  // in the same single Artist row lookup the Settings screen uses.
  const { paymentMethods } = await getArtworkSettings(site.artistId);

  return (
    <GalleriesView
      siteId={id}
      artistId={site.artistId}
      galleries={galleries}
      paymentMethods={paymentMethods}
    />
  );
}
