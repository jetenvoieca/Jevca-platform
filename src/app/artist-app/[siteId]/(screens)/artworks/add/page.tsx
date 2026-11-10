import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listHopperQueue } from "@/lib/actions/hopper";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { artistAppHref } from "@/lib/artistApp";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

// The Catalogue's "Add Artworks" in the Artist App (2026-11-10) — as the
// admin's /sites/[id]/artworks/add, with Art Manager only.
export default async function ArtistAddArtworksPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!(await readSiteFeatures(siteId)).catalogue) redirect(artistAppHref(siteId, "pages"));
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) notFound();

  const [queue, settings] = await Promise.all([listHopperQueue(site.artistId), getArtworkSettings(site.artistId)]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white">
      <HopperView
        siteId={siteId}
        basePath={artistAppHref(siteId)}
        artistId={site.artistId}
        queue={queue}
        artworkSettings={settings}
        artworkIntake
      />
    </div>
  );
}
