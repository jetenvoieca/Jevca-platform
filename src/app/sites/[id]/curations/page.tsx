import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listCurations, getCuration } from "@/lib/actions/curations";
import CurationsView from "@/components/CurationsView";

// Curations (2026-09-24) — see the note on Curation in schema.prisma.
// Force-dynamic for the same reason as the Artwork Catalogue: the view
// keeps itself up to date client-side and must never be served stale.
export const dynamic = "force-dynamic";

export default async function CurationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Which curation is open — kept in the URL so it survives a reload.
  searchParams: Promise<{ selected?: string }>;
}) {
  const { id } = await params;
  const { selected } = await searchParams;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, defaultCurrency: true },
  });
  if (!site) notFound();

  const curations = await listCurations(site.artistId);

  // Opens the curation named in the URL, otherwise the first one.
  const selectedId =
    selected && curations.some((c) => c.id === selected) ? selected : curations[0]?.id;
  const initialSelected = selectedId ? await getCuration(selectedId, site.artistId) : null;

  return (
    <CurationsView
      artistId={site.artistId}
      currency={site.defaultCurrency}
      curations={curations}
      initialSelected={initialSelected}
    />
  );
}
