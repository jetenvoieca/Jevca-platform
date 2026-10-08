import AppShell from "@/components/AppShell";
import MailTemplatesManager from "@/components/MailTemplatesManager";
import { buildTopNavItems } from "@/lib/topNav";
import { getRecentSites } from "@/lib/recentSites";
import { getOpenAlerts } from "@/lib/alerts";
import { listMailTemplates } from "@/lib/actions/mailTemplates";

export const dynamic = "force-dynamic";

// Templates → Mail Templates (2026-10-08): the shared list of mail
// layouts — see MailTemplatesManager.tsx.
export default async function MailTemplatesPage() {
  const [templates, openAlerts, recentSites] = await Promise.all([
    listMailTemplates(),
    getOpenAlerts(),
    getRecentSites(),
  ]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("mailTemplates", openAlerts.length, recentSites)}
      content={<MailTemplatesManager templates={templates} />}
    />
  );
}
