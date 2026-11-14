import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import ArtworkCatalogueScreen, { type CatalogueSearchParams } from "@/components/ArtworkCatalogueScreen";
import ClientWordsProvider from "@/components/ClientWordsProvider";
import AdminArtistPicker from "@/components/AdminArtistPicker";
import { db } from "@/lib/db";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/currentUser";
import { listCatalogueArtists } from "@/lib/masterCatalogue";

export const dynamic = "force-dynamic";

// Administration → Catalogue, one client (2026-11-14, Craig): their
// Catalogue exactly as on their site (ArtworkCatalogueScreen, through
// their first site), with the client chooser above. The client is in the
// path, as the Catalogue keeps its filters in the query.
export default async function MasterCatalogueArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ artistId: string }>;
  searchParams: Promise<CatalogueSearchParams>;
}) {
  await requireAdmin();
  const [{ artistId }, sp] = await Promise.all([params, searchParams]);
  const [artists, artist, openAlerts, recentSites] = await Promise.all([
    listCatalogueArtists(),
    db.artist.findUnique({ where: { id: artistId }, select: { kind: true } }),
    getOpenAlerts(),
    getRecentSites(),
  ]);
  const chosen = artists.find((a) => a.id === artistId);
  if (!chosen || !artist) notFound();

  return (
    <AppShell
      navItems={buildTopNavItems("catalogue", openAlerts.length, recentSites)}
      content={
        <div className="px-6 py-6">
          <div className="mb-6">
            <AdminArtistPicker
              title="Catalogue"
              basePath="/accounts/catalogue"
              artists={artists}
              artistId={artistId}
              showCounts
            />
          </div>
          <ClientWordsProvider kind={artist.kind}>
            <ArtworkCatalogueScreen siteId={chosen.siteId} sp={sp} />
          </ClientWordsProvider>
        </div>
      }
    />
  );
}
