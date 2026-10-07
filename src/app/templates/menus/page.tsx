import AppShell from "@/components/AppShell";
import MenuStylesManager from "@/components/MenuStylesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listMenuStyles } from "@/lib/actions/menuStyles";

export const dynamic = "force-dynamic";

// Templates → Menus (2026-10-06): the shared list of site menu designs
// — see MenuStylesManager.tsx.
export default async function MenusPage() {
  const [styles, openAlerts, recentSites] = await Promise.all([
    listMenuStyles(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("menuStyles", openAlerts.length, recentSites)}
      content={<MenuStylesManager styles={styles} />}
    />
  );
}
