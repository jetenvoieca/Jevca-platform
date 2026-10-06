import type { ReactNode } from "react";
import { loadPublishedSite } from "./published";
import PublishedSiteMenu from "@/components/PublishedSiteMenu";

export const dynamic = "force-dynamic";

// Around every page of a published site (2026-10-06): the page, and the
// site's menu (PublishedSiteMenu). The menu lives here rather than in the
// page so it stays in place as pages change.
export default async function SitePreviewLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const published = await loadPublishedSite(siteId);

  return (
    <>
      {children}
      {published && (
        <PublishedSiteMenu
          siteId={siteId}
          pages={published.snapshot.pages.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            menuStyleId: p.menuStyleId,
          }))}
          menus={published.snapshot.menus}
        />
      )}
    </>
  );
}
