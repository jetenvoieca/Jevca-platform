import type { AppShellNavEntry, AppShellNavItem } from "@/components/SidebarNav";
import type { ReactNode } from "react";
import { buildAccountsSection } from "@/lib/topNav";

// Colour for every section that's specific to the site you're currently
// inside (Artworks, Media, Website, Financial) — distinct from the
// default grey used for Administration/Templates/Sites, so it's
// visually obvious which groups are "always there" versus "belong to
// this particular site". Also reused by the evaluation-only nav
// (lib/previewNav.ts).
export const SITE_SECTION_COLOR = "#635572";

// Which page (within a site) is currently active, for highlighting and
// for deciding which section the accordion opens on.
// "profile" is the site's bare /sites/[id] Owner/Financial/Personal
// Profile page (in Financial); "menu" is the Menu Builder; "pages" is
// any individual page's own editor (/sites/[id]/pages/[pageId]) — an
// open page editor highlights that page within the Website section's
// page list instead, which SiteShell handles locally.
export type SiteNavKey =
  | "artworks"
  | "curations"
  | "galleries"
  | "artworkSettings"
  | "hopper"
  | "media"
  | "bucket"
  | "mediaSettings"
  | "menu"
  | "pages"
  | "account"
  | "sales"
  | "purchases"
  | "customers"
  | "profile"
  | "purchasesSettings";

const ARTWORK_KEYS: SiteNavKey[] = ["artworks", "curations", "galleries", "artworkSettings"];

const MEDIA_KEYS: SiteNavKey[] = ["hopper", "media", "bucket", "mediaSettings"];

const WEBSITE_KEYS: SiteNavKey[] = ["menu", "pages"];

const FINANCIAL_KEYS: SiteNavKey[] = [
  "account",
  "sales",
  "purchases",
  "customers",
  "profile",
  "purchasesSettings",
];

export function buildSiteNavEntries({
  siteId,
  active,
  alertCount,
  hopperCount,
  artworkNeedsReviewCount,
  mediaNeedsReviewCount,
  salesEnabled,
  websiteSectionBody,
}: {
  siteId: string;
  active: SiteNavKey | null;
  alertCount: number;
  hopperCount: number;
  artworkNeedsReviewCount: number;
  mediaNeedsReviewCount: number;
  salesEnabled: boolean;
  // The Website section needs more than plain links (per-page
  // visibility toggles, an inline add-page form) — built by SiteShell,
  // which holds the client-side state for it, and passed through here.
  websiteSectionBody: ReactNode;
}): AppShellNavEntry[] {
  const base = `/sites/${siteId}`;

  const artworkChildren: AppShellNavItem[] = [
    {
      label: "Catalogue",
      href: `${base}/artworks`,
      active: active === "artworks",
      badge: artworkNeedsReviewCount,
    },
    { label: "Curations", href: `${base}/curations`, active: active === "curations" },
    // "Locations" — the /galleries route, relabelled.
    { label: "Locations", href: `${base}/galleries`, active: active === "galleries" },
    {
      label: "Settings",
      href: `${base}/artworks/settings`,
      active: active === "artworkSettings",
      subtle: true,
    },
  ];

  const mediaChildren: AppShellNavItem[] = [
    { label: "Hopper", href: `${base}/hopper`, active: active === "hopper", badge: hopperCount },
    {
      label: "Catalogue",
      href: `${base}/media`,
      active: active === "media",
      badge: mediaNeedsReviewCount,
    },
    { label: "Bucket", href: `${base}/bucket`, active: active === "bucket" },
    {
      label: "Settings",
      href: `${base}/media/settings`,
      active: active === "mediaSettings",
      subtle: true,
    },
  ];

  // Sales and Customers sit behind salesEnabled; Account, Purchases and
  // Profile don't.
  const financialChildren: AppShellNavItem[] = [
    { label: "Account", href: `${base}/account`, active: active === "account" },
    ...(salesEnabled
      ? [{ label: "Sales", href: `${base}/sales`, active: active === "sales" }]
      : []),
    { label: "Purchases", href: `${base}/purchases`, active: active === "purchases" },
    ...(salesEnabled
      ? [{ label: "Customers", href: `${base}/customers`, active: active === "customers" }]
      : []),
    { label: "Profile", href: base, active: active === "profile" },
    {
      label: "Settings",
      href: `${base}/purchases/settings`,
      active: active === "purchasesSettings",
      subtle: true,
    },
  ];

  const sectionActive = (keys: SiteNavKey[]) => active !== null && keys.includes(active);

  return [
    // Same "Administration" group as the top-level Accounts pages —
    // none of its own keys apply while inside a site.
    buildAccountsSection(null, alertCount),
    { label: "Templates", href: "/templates", active: false },
    { label: "Sites", href: "/", active: false },
    {
      label: "Artworks",
      section: true,
      key: "artworks",
      color: SITE_SECTION_COLOR,
      active: sectionActive(ARTWORK_KEYS),
      children: artworkChildren,
    },
    {
      label: "Media",
      section: true,
      key: "media",
      color: SITE_SECTION_COLOR,
      active: sectionActive(MEDIA_KEYS),
      children: mediaChildren,
    },
    {
      label: "Website",
      section: true,
      key: "website",
      color: SITE_SECTION_COLOR,
      active: sectionActive(WEBSITE_KEYS),
      customChildren: websiteSectionBody,
    },
    {
      label: "Financial",
      section: true,
      key: "financial",
      color: SITE_SECTION_COLOR,
      active: sectionActive(FINANCIAL_KEYS),
      children: financialChildren,
    },
  ];
}
