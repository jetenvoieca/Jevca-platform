import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCurations, getCuration } from "@/lib/actions/curations";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import CurationsView from "@/components/CurationsView";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";

// The preview's Curations — the same view as /sites/[id]/curations.
export const dynamic = "force-dynamic";

export default async function PreviewCurationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ selected?: string }>;
}) {
  const { slug } = await params;
  const { selected } = await searchParams;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) notFound();

  const curations = await listCurations(site.artistId);
  const selectedId =
    selected && curations.some((c) => c.id === selected) ? selected : curations[0]?.id;
  const [initialSelected, settings] = await Promise.all([
    selectedId ? getCuration(selectedId, site.artistId) : Promise.resolve(null),
    // For a work's Catalogue and Consign windows (2026-10-27).
    getArtworkSettings(site.artistId),
  ]);

  return (
    <CurationsView
      artistId={site.artistId}
      siteId={siteId}
      curations={curations}
      initialSelected={initialSelected}
      settings={settings}
    />
  );
}
