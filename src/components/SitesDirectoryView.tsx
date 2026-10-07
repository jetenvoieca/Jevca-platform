import AppShell from "@/components/AppShell";
import SitesListColumn from "@/components/SitesListColumn";
import { buildTopNavItems } from "@/lib/topNav";
import type { RecentSite } from "@/lib/recentSites";

type SiteRow = {
  id: string;
  name: string;
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT";
  ownerName: string;
  paymentMethod: string | null;
  createdAt: string;
};

export default function SitesDirectoryView({
  sites,
  q,
  sort,
  status,
  alertCount = 0,
  recentSites,
}: {
  sites: SiteRow[];
  q: string;
  sort: string;
  status: string;
  alertCount?: number;
  recentSites: RecentSite[];
}) {
  return (
    <AppShell
      publishEnabled={false}
      navItems={buildTopNavItems("sites", alertCount, recentSites)}
      rightPanel={
        <SitesListColumn
          sites={sites}
          q={q}
          sort={sort}
          status={status}
          pinnedSiteId={recentSites[0]?.id ?? null}
          // 2026-09-12, direct request — picking a site from this list
          // opens straight onto its Artwork Catalogue (Content section)
          // rather than its Profile/Overview page.
          siteLinkSuffix="/artworks"
        />
      }
      content={
        <div className="flex h-full items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Select a site from the list to view and edit its settings.
          </p>
        </div>
      }
    />
  );
}
