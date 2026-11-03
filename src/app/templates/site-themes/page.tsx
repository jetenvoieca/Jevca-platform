import AppShell from "@/components/AppShell";
import SiteThemesManager from "@/components/SiteThemesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listSiteThemes } from "@/lib/actions/siteThemes";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listMenuStyles } from "@/lib/actions/menuStyles";

export const dynamic = "force-dynamic";

// Templates → Site Themes (2026-11-03): the pages a site of each theme
// has — see SiteThemesManager.tsx.
export default async function SiteThemesPage() {
  const [themes, pageStyles, menuStyles, openAlerts, recentSites] = await Promise.all([
    listSiteThemes(),
    listPageStyles(),
    listMenuStyles(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("siteThemes", openAlerts.length, recentSites)}
      content={<SiteThemesManager themes={themes} pageStyles={pageStyles} menuStyles={menuStyles} />}
    />
  );
}
