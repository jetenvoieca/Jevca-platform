import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listExhibitions } from "@/lib/actions/exhibitions";
import { readLocations } from "@/lib/artworkSettingsData";
import ExhibitionsView from "@/components/ExhibitionsView";

// The Exhibitions catalogue (2026-11-02) — see Exhibition in
// schema.prisma. Force-dynamic like the other catalogues: the view keeps
// itself up to date client-side and must never be served stale.
export const dynamic = "force-dynamic";

export default async function ExhibitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();

  const [exhibitions, locations] = await Promise.all([listExhibitions(site.artistId), readLocations(site.artistId)]);
  return (
    <ExhibitionsView
      artistId={site.artistId}
      siteId={id}
      initialExhibitions={exhibitions}
      initialLocations={locations}
    />
  );
}
