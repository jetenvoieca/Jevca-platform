import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listLocationCustomers } from "@/lib/actions/locations";
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

  // Every Location now (2026-09-22 rework) — Gallery and Own alike, via
  // the new Location model (actions/locations.ts), same change as the
  // real (non-preview) galleries/page.tsx.
  const galleries = await listLocationCustomers(site.artistId);
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
