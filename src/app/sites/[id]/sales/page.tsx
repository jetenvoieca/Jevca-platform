import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSalesForArtist } from "@/lib/actions/sales";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import SalesView from "@/components/SalesView";

// Missing here until 2026-08-16, unlike Artworks/Media/Hopper/Bucket,
// which all set this already. Without it, this route can be served from
// Next's Full Route Cache — router.refresh() (used throughout SalesView
// after deleting/marking-paid a sale) re-requests the route but doesn't
// itself bypass that cache, so a deleted sale's row could keep showing
// until a hard reload even though the delete succeeded. See the matching
// fix on Customers/Galleries — same root cause, same fix.
export const dynamic = "force-dynamic";

export default async function SalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, salesEnabled: true },
  });
  if (!site) notFound();

  if (!site.salesEnabled) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Sales</h1>
        <p className="max-w-md text-sm text-neutral-500">
          The Sales menu isn&apos;t switched on for this site yet — not every site sells directly
          (some are portfolio-only), so it&apos;s off by default. Turn it on from the Sites
          Directory panel for this site if you&apos;d like to use it here.
        </p>
      </div>
    );
  }

  const [sales, settings] = await Promise.all([
    getSalesForArtist(site.artistId),
    getArtworkSettings(site.artistId),
  ]);

  return (
    <SalesView
      siteId={id}
      artistId={site.artistId}
      sales={sales}
      saleSources={settings.saleSources}
      paymentMethods={settings.paymentMethods}
    />
  );
}
