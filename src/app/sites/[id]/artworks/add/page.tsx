import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listHopperQueue, getHopperTargetArtwork } from "@/lib/actions/hopper";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

// "Add Artworks" (2026-10-15) — the Hopper narrowed to adding artworks
// and their ancillary images, reached from the Artwork Catalogue's
// "+ Add New". Same queue as the full Hopper. See HopperView's
// artworkIntake. With ?artwork= (an artwork's own image "+ Add") it is
// for that one artwork — Bin and Ancillary image only (forArtwork).
export default async function AddArtworksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ artwork?: string }>;
}) {
  const { id } = await params;
  const { artwork: artworkId } = await searchParams;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();

  const [queue, settings, forArtwork] = await Promise.all([
    listHopperQueue(site.artistId),
    getArtworkSettings(site.artistId),
    artworkId ? getHopperTargetArtwork(site.artistId, artworkId) : null,
  ]);

  return (
    <HopperView
      siteId={id}
      artistId={site.artistId}
      queue={queue}
      artworkSettings={settings}
      artworkIntake
      forArtwork={forArtwork ?? undefined}
    />
  );
}
