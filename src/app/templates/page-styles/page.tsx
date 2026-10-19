import AppShell from "@/components/AppShell";
import PageStylesManager from "@/components/PageStylesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listPresentationTemplates } from "@/lib/actions/presentationTemplates";

export const dynamic = "force-dynamic";

// Templates → Page Styles (2026-10-04): the shared list of page layouts
// — see PageStylesManager.tsx.
export default async function PageStylesPage() {
  const [styles, presentationTemplates, openAlerts, recentSites] = await Promise.all([
    listPageStyles(),
    listPresentationTemplates(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("pageStyles", openAlerts.length, recentSites)}
      content={
        <PageStylesManager
          styles={styles}
          presentationTemplates={presentationTemplates.map((t) => ({ id: t.id, name: t.name }))}
        />
      }
    />
  );
}
