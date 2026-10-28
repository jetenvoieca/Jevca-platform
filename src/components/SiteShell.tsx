"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { publishSite } from "@/lib/actions/siteSnapshot";
import { buildSiteNavEntries, type SiteNavKey } from "@/lib/siteNav";
import { siteNavKeyForPath } from "@/lib/siteMenuAccess";
import type { RecentSite } from "@/lib/recentSites";
import { useClientWords } from "@/components/ClientWordsProvider";
import { PageHeadingProvider } from "@/components/PageHeading";

// "Publish to live site" (2026-10-06) is always available: it saves a
// fresh snapshot of the whole site each time (lib/actions/siteSnapshot.ts)
// and shows when the site was last published (see PublishButton).
export default function SiteShell({
  siteId,
  salesEnabled,
  alertCount,
  lastPublishedAt,
  recentSites,
  allowed,
  header,
  topActions,
  children,
}: {
  siteId: string;
  salesEnabled: boolean;
  alertCount: number;
  // ISO date, or null if the site has never been published.
  lastPublishedAt: string | null;
  // The recent sites under "Sites" in the menu — this site first.
  recentSites: RecentSite[];
  // An artist login's ticked menu items (2026-10-26); null for an admin.
  allowed: SiteNavKey[] | null;
  // The site name / domain header, pinned above the scrolling page
  // content — built by the (server) layout since it needs the site
  // record, passed in ready-made. It holds the PageHeadingSlot.
  header: ReactNode;
  // Beside the menu button on a narrower screen (see AppShell).
  topActions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const words = useClientWords();

  const navItems = buildSiteNavEntries({
    siteId,
    // Which item is highlighted, from the page's address (the shell
    // wraps every page under /sites/[id]/*).
    active: siteNavKeyForPath(pathname, siteId),
    alertCount,
    salesEnabled,
    recentSites,
    words,
    allowed,
  });

  return (
    <AppShell
      publishEnabled
      publishAction={publishSite.bind(null, siteId)}
      lastPublishedAt={lastPublishedAt}
      navItems={navItems}
      topActions={topActions}
      content={
        <PageHeadingProvider>
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-neutral-200 px-6 py-4">{header}</div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </div>
        </PageHeadingProvider>
      }
    />
  );
}
