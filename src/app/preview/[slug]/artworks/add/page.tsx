import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listHopperQueue } from "@/lib/actions/hopper";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

// The preview's "Add Artworks" — see /sites/[id]/artworks/add. Artists
// don't get the full Hopper.
export default async function PreviewAddArtworksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) notFound();
  const artistId = site.artistId;

  const [queue, settings] = await Promise.all([listHopperQueue(artistId), getArtworkSettings(artistId)]);

  return (
    <HopperView
      siteId={siteId}
      basePath={`/preview/${slug}`}
      artistId={artistId}
      queue={queue}
      artworkSettings={settings}
      artworkIntake
    />
  );
}
