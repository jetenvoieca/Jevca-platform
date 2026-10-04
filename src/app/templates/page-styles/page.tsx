import AppShell from "@/components/AppShell";
import PageStylesManager from "@/components/PageStylesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getOpenAlerts } from "@/lib/alerts";
import { listPageStyles } from "@/lib/actions/pageStyles";

export const dynamic = "force-dynamic";

// Templates → Page Styles (2026-10-04): the shared list of page layouts
// — see PageStylesManager.tsx.
export default async function PageStylesPage() {
  const [styles, openAlerts] = await Promise.all([listPageStyles(), getOpenAlerts()]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("pageStyles", openAlerts.length)}
      content={<PageStylesManager styles={styles} />}
    />
  );
}
