import AppShell from "@/components/AppShell";
import MenuStylesManager from "@/components/MenuStylesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";
import { listMenuStyles } from "@/lib/actions/menuStyles";

export const dynamic = "force-dynamic";

// Templates → Menus (2026-10-06): the shared list of site menu designs
// — see MenuStylesManager.tsx.
export default async function MenusPage() {
  const [styles, openAlerts] = await Promise.all([listMenuStyles(), getOpenAlerts()]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("menuStyles", openAlerts.length)}
      content={<MenuStylesManager styles={styles} />}
    />
  );
}
