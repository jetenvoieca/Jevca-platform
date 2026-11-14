import AppShell from "@/components/AppShell";
import AdminArtistPicker from "@/components/AdminArtistPicker";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/currentUser";
import { listCatalogueArtists } from "@/lib/masterCatalogue";

export const dynamic = "force-dynamic";

// Administration → Curator (2026-11-14, Craig): choose the client whose
// site will show the curations — see ./[artistId]/page.tsx.
export default async function CuratorPage() {
  await requireAdmin();
  const [artists, openAlerts, recentSites] = await Promise.all([
    listCatalogueArtists(),
    getOpenAlerts(),
    getRecentSites(),
  ]);
  return (
    <AppShell
      navItems={buildTopNavItems("curator", openAlerts.length, recentSites)}
      content={
        <div className="px-6 py-6">
          <AdminArtistPicker title="Curator — for" basePath="/accounts/curator" artists={artists} artistId={null} />
          <p className="mt-3 text-sm text-neutral-500">
            Choose the client whose site will show the curations; their works can come from any artist.
          </p>
        </div>
      }
    />
  );
}
