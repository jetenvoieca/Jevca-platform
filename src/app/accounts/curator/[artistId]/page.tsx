import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import AdminArtistPicker from "@/components/AdminArtistPicker";
import ClientWordsProvider from "@/components/ClientWordsProvider";
import CurationsView from "@/components/CurationsView";
import { db } from "@/lib/db";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/currentUser";
import { listCatalogueArtists } from "@/lib/masterCatalogue";
import { getCuration, listCurations } from "@/lib/actions/curations";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";

export const dynamic = "force-dynamic";

// Administration → Curator (2026-11-14, Craig): cross-artist curations. A
// curation belongs to the client whose site shows it (Craig: "by the site
// that shows it") — their Curations screen, with works added from any
// client (CurationsView's `crossArtist`). Their own Curations show it too;
// the other artists don't see it.
export default async function CuratorArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ artistId: string }>;
  // Which curation is open, as on the site's Curations.
  searchParams: Promise<{ selected?: string }>;
}) {
  await requireAdmin();
  const [{ artistId }, { selected }] = await Promise.all([params, searchParams]);
  const [artists, artist, curations, settings, openAlerts, recentSites] = await Promise.all([
    listCatalogueArtists(),
    db.artist.findUnique({ where: { id: artistId }, select: { kind: true } }),
    listCurations(artistId),
    getArtworkSettings(artistId),
    getOpenAlerts(),
    getRecentSites(),
  ]);
  const host = artists.find((a) => a.id === artistId);
  if (!host || !artist) notFound();
  const selectedId = selected && curations.some((c) => c.id === selected) ? selected : curations[0]?.id;
  const initialSelected = selectedId ? await getCuration(selectedId, artistId) : null;

  return (
    <AppShell
      navItems={buildTopNavItems("curator", openAlerts.length, recentSites)}
      content={
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-6 pt-6">
            <AdminArtistPicker title="Curator — for" basePath="/accounts/curator" artists={artists} artistId={artistId} />
          </div>
          <div className="min-h-0 flex-1">
            <ClientWordsProvider kind={artist.kind}>
              <CurationsView
                artistId={artistId}
                siteId={host.siteId}
                curations={curations}
                initialSelected={initialSelected}
                settings={settings}
                crossArtist={{ artists }}
              />
            </ClientWordsProvider>
          </div>
        </div>
      }
    />
  );
}
