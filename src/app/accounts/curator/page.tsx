import AppShell from "@/components/AppShell";
import AdminArtistPicker from "@/components/AdminArtistPicker";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/currentUser";
import { listCatalogueArtists } from "@/lib/masterCatalogue";

export const dynamic = "force-dynamic";

// Administration → Curator (2026-11-14, Craig): choose the house client
// (one of ours) whose sites will show the curations — see
// ./[artistId]/page.tsx.
export default async function CuratorPage() {
  await requireAdmin();
  const [artists, openAlerts, recentSites] = await Promise.all([
    listCatalogueArtists({ house: true }),
    getOpenAlerts(),
    getRecentSites(),
  ]);
  return (
    <AppShell
      navItems={buildTopNavItems("curator", openAlerts.length, recentSites)}
      content={
        <div className="px-6 py-6">
          {artists.length > 0 ? (
            <AdminArtistPicker title="Curator — for" basePath="/accounts/curator" artists={artists} artistId={null} />
          ) : (
            <h1 className="text-2xl font-semibold text-neutral-900">Curator</h1>
          )}
          <p className="mt-3 text-sm text-neutral-500">
            {artists.length > 0
              ? "Choose which of our sites' owners the curations are for; their works can come from any artist."
              : "No house client yet — in Clients, open ours (e.g. Jetenvoieca) and tick House client."}
          </p>
        </div>
      }
    />
  );
}
