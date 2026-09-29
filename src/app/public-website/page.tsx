import type { Metadata } from "next";
import WebsiteHomeView from "@/components/WebsiteHomeView";
import { getWebsiteHome, listWebsiteMenuItems, listWebsitePages } from "@/lib/actions/website";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Jetenvoieca" };

// www.jetenvoieca.com/ (2026-09-29) — reached through the rewrite in
// middleware.ts. Same WebsiteHomeView the editor previews.
export default async function PublicWebsiteHome() {
  const [home, items, pages] = await Promise.all([
    getWebsiteHome(),
    listWebsiteMenuItems(),
    listWebsitePages(),
  ]);
  const slugById = new Map(pages.map((p) => [p.id, p.slug]));

  return (
    <main className="h-screen overflow-y-auto">
      <WebsiteHomeView
        home={home}
        items={items.map((i) => {
          const slug = i.pageId ? slugById.get(i.pageId) : undefined;
          return {
            id: i.id,
            label: i.label,
            text: i.text,
            hoverText: i.hoverText,
            href: slug ? `/${slug}` : null,
          };
        })}
      />
    </main>
  );
}
