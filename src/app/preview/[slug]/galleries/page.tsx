import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listGalleries } from "@/lib/actions/customers";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import GalleriesView from "@/components/GalleriesView";

export const dynamic = "force-dynamic";

export default async function PreviewGalleriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) notFound();

  const galleries = await listGalleries(site.artistId);
  const { paymentMethods } = await getArtworkSettings(site.artistId);

  return (
    <GalleriesView
      siteId={siteId}
      artistId={site.artistId}
      galleries={galleries}
      paymentMethods={paymentMethods}
    />
  );
}
