import AppShell from "@/components/AppShell";
import WebsiteEditor from "@/components/WebsiteEditor";
import WebsiteHomeEditor from "@/components/WebsiteHomeEditor";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import { getWebsiteHome, listWebsiteMenuItems, listWebsitePages } from "@/lib/actions/website";

// Shared by the Home route (/accounts/website) and each content page's
// route (/accounts/website/[pageId]) — one place builds the editor.
// selectedId null = the Home page.
export default async function WebsiteEditorPage({ selectedId }: { selectedId: string | null }) {
  const [pages, openAlerts] = await Promise.all([listWebsitePages(), getOpenAlerts()]);

  let content: React.ReactNode;
  if (selectedId === null) {
    const [home, items] = await Promise.all([getWebsiteHome(), listWebsiteMenuItems()]);
    content = <WebsiteHomeEditor pages={pages} initialHome={home} initialItems={items} />;
  } else {
    // Content page editor — step 3.
    content = (
      <WebsiteEditor
        pages={pages}
        selectedId={selectedId}
        preview={
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-md border border-dashed border-neutral-300 text-sm text-neutral-400">
            Preview
          </div>
        }
        fields={<p className="text-sm text-neutral-400">Content page fields</p>}
      />
    );
  }

  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("website", openAlerts.length)}
      content={content}
    />
  );
}
