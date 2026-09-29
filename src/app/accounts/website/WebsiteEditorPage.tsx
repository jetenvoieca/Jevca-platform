import AppShell from "@/components/AppShell";
import WebsiteEditor from "@/components/WebsiteEditor";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { listWebsitePages } from "@/lib/actions/website";

// Shared by the Home route (/accounts/website) and each content page's
// route (/accounts/website/[pageId]) — one place builds the editor.
// selectedId null = the Home page.
export default async function WebsiteEditorPage({ selectedId }: { selectedId: string | null }) {
  const [pages, openAlerts] = await Promise.all([listWebsitePages(), getOpenAlerts()]);

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("website", openAlerts.length)}
      content={<WebsiteEditor pages={pages} selectedId={selectedId} />}
    />
  );
}
