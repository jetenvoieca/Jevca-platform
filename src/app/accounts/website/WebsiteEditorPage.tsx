import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import WebsiteHomeEditor from "@/components/WebsiteHomeEditor";
import WebsiteContentEditor from "@/components/WebsiteContentEditor";
import { getOpenAlerts } from "@/lib/alerts";
import { buildTopNavItems } from "@/lib/topNav";
import {
  getWebsiteHome,
  getWebsitePage,
  listWebsiteMenuItems,
  listWebsitePages,
} from "@/lib/actions/website";

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
    const page = await getWebsitePage(selectedId);
    if (!page) notFound();
    // The Contact page shows the Home page's email (direct decision —
    // one address, set in one place).
    const contactEmail = page.kind === "CONTACT" ? (await getWebsiteHome()).email : null;
    // key: a fresh editor per page, so switching pages never carries
    // one page's typed-in state across to another.
    content = (
      <WebsiteContentEditor
        key={page.id}
        pages={pages}
        initialPage={page}
        contactEmail={contactEmail}
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
