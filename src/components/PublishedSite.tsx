"use client";

import { useEffect, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { pageForPath, publishedHomePath, type SiteSnapshot } from "@/lib/siteSnapshot";
import { SnapshotSiteData } from "@/lib/siteData";
import PagePreview from "@/components/PagePreview";
import PublishedSiteMenu from "@/components/PublishedSiteMenu";

// A published site (2026-10-06; 2026-10-13 instant pages): drawn from its
// snapshot with the same components as the admin preview (PagePreview),
// with the site's menu (PublishedSiteMenu). It's loaded once, by the
// site's layout, when a visitor arrives; after that, following a link to
// another of the site's pages (the menu, a Logo…) changes the address
// and draws that page in the browser — no trip to the server, so pages
// change at once. Back and forward work as usual, and every address
// still opens its page directly. `siteKey` (2026-10-10): the robot
// check's public key for this address, for sign-up forms.
export default function PublishedSite({
  siteId,
  siteKey,
  snapshot,
}: {
  siteId: string;
  siteKey: string | null;
  snapshot: SiteSnapshot;
}) {
  const pathname = usePathname();
  const page = pageForPath(siteId, snapshot.pages, pathname);
  const isCanvas = page?.style?.type === "CANVAS";

  useEffect(() => {
    document.title = page ? `${page.title} — ${snapshot.siteName}` : snapshot.siteName;
  }, [page, snapshot.siteName]);

  // A plain click on a link to another of the site's pages: show it here.
  // Anything else (another site, an email address, a new tab…) is left
  // to the browser.
  const followLink = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const link = (e.target as Element).closest("a");
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith(publishedHomePath(siteId))) return;
    if (!pageForPath(siteId, snapshot.pages, url.pathname)) return;
    e.preventDefault();
    if (url.pathname !== window.location.pathname) {
      window.history.pushState(null, "", url.pathname);
      window.scrollTo(0, 0);
    }
  };

  return (
    <SnapshotSiteData siteId={siteId} siteKey={siteKey} snapshot={snapshot}>
      <div onClick={followLink}>
        {page && (
          // A flex column so the page's background fills the whole
          // window, however short the page.
          <main className={isCanvas ? "" : "flex min-h-[100dvh] flex-col"}>
            <PagePreview
              key={page.id}
              pageId={page.id}
              curationId={page.curationId}
              style={page.style}
              fullScreen
            />
          </main>
        )}
        <PublishedSiteMenu
          siteId={siteId}
          pages={snapshot.pages}
          menus={snapshot.menus}
          currentId={page?.id ?? null}
        />
      </div>
    </SnapshotSiteData>
  );
}
