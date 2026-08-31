import type { AppShellNavEntry, AppShellNavItem } from "@/components/SidebarNav";
import type { ReactNode } from "react";
import { buildAccountsSection } from "@/lib/topNav";

// Which page (within a site) is currently active, for highlighting and
// for deciding which of the four groups the accordion should open on.
// "menu" covers both the Menu Builder page and, loosely, the Sites
// section as a whole when nothing more specific matches.
export type SiteNavKey =
  | "menu"
  | "hopper"
  | "artworks"
  | "artworkSettings"
  | "media"
  | "bucket"
  | "mediaSettings"
  | "sales"
  | "customers"
  | "galleries"
  | "purchases"
  | "purchasesSettings";

const CONTENT_KEYS: SiteNavKey[] = [
  "hopper",
  "artworks",
  "artworkSettings",
  "media",
  "bucket",
  "mediaSettings",
];

const FINANCIAL_KEYS: SiteNavKey[] = [
  "sales",
  "customers",
  "galleries",
  "purchases",
  "purchasesSettings",
];

export function buildSiteNavEntries({
  siteId,
  active,
  alertCount,
  hopperCount,
  bucketCount,
  artworkNeedsReviewCount,
  mediaNeedsReviewCount,
  salesEnabled,
  sitesSectionBody,
}: {
  siteId: string;
  active: SiteNavKey | null;
  alertCount: number;
  hopperCount: number;
  bucketCount: number;
  artworkNeedsReviewCount: number;
  mediaNeedsReviewCount: number;
  salesEnabled: boolean;
  // The Sites section needs more than plain links (per-page visibility
  // toggles, an inline add-page form) — that part is built by the
  // caller (SiteShell, which holds the client-side state for it) and
  // passed straight through here.
  sitesSectionBody: ReactNode;
}): AppShellNavEntry[] {
  const base = `/sites/${siteId}`;

  const contentChildren: AppShellNavItem[] = [
    { label: "Hopper", href: `${base}/hopper`, active: active === "hopper", badge: hopperCount },
    {
      label: "Artwork Catalogue",
      href: `${base}/artworks`,
      active: active === "artworks",
      badge: artworkNeedsReviewCount,
    },
    {
      label: "Settings",
      href: `${base}/artworks/settings`,
      active: active === "artworkSettings",
      subtle: true,
    },
    {
      label: "Media Catalogue",
      href: `${base}/media`,
      active: active === "media",
      badge: mediaNeedsReviewCount,
    },
    { label: "Bucket", href: `${base}/bucket`, active: active === "bucket", subtle: true },
    {
      label: "Settings",
      href: `${base}/media/settings`,
      active: active === "mediaSettings",
      subtle: true,
    },
  ];

  const financialChildren: AppShellNavItem[] = [
    ...(salesEnabled
      ? [
          { label: "Sales", href: `${base}/sales`, active: active === "sales" },
          { label: "Customers", href: `${base}/customers`, active: active === "customers" },
        ]
      : []),
    { label: "Galleries", href: `${base}/galleries`, active: active === "galleries" },
    { label: "Purchases", href: `${base}/purchases`, active: active === "purchases" },
    {
      label: "Settings",
      href: `${base}/purchases/settings`,
      active: active === "purchasesSettings",
      subtle: true,
    },
  ];

  return [
    // Same "Accounts" group as the top-level Accounts pages — none of
    // its own keys apply while inside a site, so it's never the one
    // that auto-opens here.
    buildAccountsSection(null, alertCount),
    {
      label: "Sites",
      section: true,
      key: "sites",
      active: active === "menu",
      customChildren: sitesSectionBody,
    },
    {
      label: "Content",
      section: true,
      key: "content",
      active: active !== null && CONTENT_KEYS.includes(active),
      children: contentChildren,
    },
    {
      label: "Financial",
      section: true,
      key: "financial",
      active: active !== null && FINANCIAL_KEYS.includes(active),
      children: financialChildren,
    },
  ];
}
