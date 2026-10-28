import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listHopperQueue } from "@/lib/actions/hopper";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

// "Add Artworks" (2026-10-15) — the Hopper narrowed to adding artworks,
// reached from the Artwork Catalogue's ⊞. Same queue as the full Hopper.
// See HopperView's artworkIntake.
export default async function AddArtworksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();

  const [queue, settings] = await Promise.all([listHopperQueue(site.artistId), getArtworkSettings(site.artistId)]);

  return <HopperView siteId={id} artistId={site.artistId} queue={queue} artworkSettings={settings} artworkIntake />;
}
