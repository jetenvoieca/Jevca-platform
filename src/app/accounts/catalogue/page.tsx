import AppShell from "@/components/AppShell";
import CatalogueArtistPicker from "@/components/master-catalogue/CatalogueArtistPicker";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/currentUser";
import { listCatalogueArtists } from "@/lib/masterCatalogue";

export const dynamic = "force-dynamic";

// Administration → Catalogue (2026-11-14, Craig): choose a client — see
// lib/masterCatalogue.ts and ./[artistId]/page.tsx.
export default async function MasterCataloguePage() {
  await requireAdmin();
  const [artists, openAlerts, recentSites] = await Promise.all([
    listCatalogueArtists(),
    getOpenAlerts(),
    getRecentSites(),
  ]);
  return (
    <AppShell
      navItems={buildTopNavItems("catalogue", openAlerts.length, recentSites)}
      content={
        <div className="px-6 py-6">
          <CatalogueArtistPicker artists={artists} artistId={null} />
        </div>
      }
    />
  );
}
