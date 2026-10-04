"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { publishSite } from "@/lib/actions/pages";
import { buildSiteNavEntries, type SiteNavKey } from "@/lib/siteNav";

// Works out which nav item should be highlighted/open purely from the
// current path — this shell is rendered once from the shared site
// layout, wrapping every page under /sites/[id]/*, rather than each
// page declaring its own key. The bare /sites/[id] route is the Profile
// page (Financial). Anything unmatched highlights nothing.
function resolveActiveKey(pathname: string, siteId: string): SiteNavKey | null {
  const base = `/sites/${siteId}`;
  if (pathname === base) return "profile";
  if (pathname === `${base}/artworks/settings`) return "artworkSettings";
  if (pathname.startsWith(`${base}/artworks`)) return "artworks";
  if (pathname.startsWith(`${base}/curations`)) return "curations";
  if (pathname.startsWith(`${base}/galleries`)) return "galleries";
  if (pathname === `${base}/media/settings`) return "mediaSettings";
  if (pathname.startsWith(`${base}/media`)) return "media";
  if (pathname === `${base}/hopper`) return "hopper";
  if (pathname === `${base}/bucket`) return "bucket";
  if (pathname.startsWith(`${base}/pages`)) return "pages";
  if (pathname.startsWith(`${base}/analytics`)) return "analytics";
  if (pathname.startsWith(`${base}/account`)) return "account";
  if (pathname.startsWith(`${base}/sales`)) return "sales";
  if (pathname.startsWith(`${base}/purchases/settings`)) return "purchasesSettings";
  if (pathname.startsWith(`${base}/purchases`)) return "purchases";
  if (pathname.startsWith(`${base}/customers`)) return "customers";
  return null;
}

export default function SiteShell({
  siteId,
  salesEnabled,
  hopperCount,
  artworkNeedsReviewCount,
  mediaNeedsReviewCount,
  alertCount,
  hasUnpublished,
  header,
  children,
}: {
  siteId: string;
  salesEnabled: boolean;
  hopperCount: number;
  artworkNeedsReviewCount: number;
  mediaNeedsReviewCount: number;
  alertCount: number;
  hasUnpublished: boolean;
  // The site name / domain header, pinned above the scrolling page
  // content — built by the (server) layout since it needs the site
  // record, passed in ready-made.
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const navItems = buildSiteNavEntries({
    siteId,
    active: resolveActiveKey(pathname, siteId),
    alertCount,
    hopperCount,
    artworkNeedsReviewCount,
    mediaNeedsReviewCount,
    salesEnabled,
  });

  return (
    <AppShell
      publishEnabled={hasUnpublished}
      publishAction={publishSite.bind(null, siteId)}
      navItems={navItems}
      content={
        <div className="flex h-full flex-col">
          <div className="shrink-0 border-b border-neutral-200 px-6 py-4">{header}</div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      }
    />
  );
}
