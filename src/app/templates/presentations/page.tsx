import AppShell from "@/components/AppShell";
import PresentationTemplatesManager from "@/components/PresentationTemplatesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listPresentationTemplates } from "@/lib/actions/presentationTemplates";

export const dynamic = "force-dynamic";

// Templates → Presentations (2026-10-19): the shared looks for a work's
// details when it's opened on a page — see PresentationTemplatesManager.tsx.
export default async function PresentationsPage() {
  const [templates, openAlerts, recentSites] = await Promise.all([
    listPresentationTemplates(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      navItems={buildTopNavItems("presentationTemplates", openAlerts.length, recentSites)}
      content={<PresentationTemplatesManager templates={templates} />}
    />
  );
}
