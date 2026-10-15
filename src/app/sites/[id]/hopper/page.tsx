import { db } from "@/lib/db";
import { listHopperQueue } from "@/lib/actions/hopper";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

export default async function HopperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Where to go back to once an item is added to Media — set by a media
  // picker's "Upload new". Only a path within this app is accepted.
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo: returnToRaw } = await searchParams;
  const returnTo =
    returnToRaw && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? returnToRaw
      : undefined;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [queue, settings] = await Promise.all([
    listHopperQueue(artistId),
    // Only needed for the inline "quick catalogue" fields shown after
    // "Add Artwork" (2026-08-17) — see HopperView.tsx.
    getArtworkSettings(artistId),
  ]);

  return (
    <HopperView
      siteId={id}
      artistId={artistId}
      queue={queue}
      artworkSettings={settings}
      returnTo={returnTo}
    />
  );
}
