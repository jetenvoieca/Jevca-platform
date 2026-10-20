import type { Metadata } from "next";
import { headers } from "next/headers";
import WebsiteHomeView from "@/components/WebsiteHomeView";
import { getWebsiteHome, listWebsiteMenuItems, listWebsitePages } from "@/lib/actions/website";
import { turnstileSiteKeyForHost } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Jetenvoieca" };

// www.jetenvoieca.com/ (2026-09-29) — reached through the rewrite in
// middleware.ts. Same WebsiteHomeView the editor previews, plus the
// robot check's key for its contact form on this address.
export default async function PublicWebsiteHome() {
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
  const [home, items, pages, contactSiteKey] = await Promise.all([
    getWebsiteHome(),
    listWebsiteMenuItems(),
    listWebsitePages(),
    turnstileSiteKeyForHost(host),
  ]);
  const slugById = new Map(pages.map((p) => [p.id, p.slug]));

  return (
    <main className="h-screen overflow-y-auto">
      <WebsiteHomeView
        home={home}
        contactSiteKey={contactSiteKey}
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
