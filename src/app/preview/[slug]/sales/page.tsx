import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSalesForArtist } from "@/lib/actions/sales";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import SalesView from "@/components/SalesView";

export const dynamic = "force-dynamic";

export default async function PreviewSalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artistId: true, salesEnabled: true },
  });
  if (!site) notFound();

  if (!site.salesEnabled) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Sales</h1>
        <p className="max-w-md text-sm text-neutral-500">
          The Sales menu isn&apos;t switched on for this site yet.
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
      siteId={siteId}
      artistId={site.artistId}
      sales={sales}
      saleSources={settings.saleSources}
      paymentMethods={settings.paymentMethods}
    />
  );
}
