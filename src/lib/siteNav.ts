import type { AppShellNavEntry, AppShellNavItem } from "@/components/SidebarNav";
import type { ReactNode } from "react";
import { buildAccountsSection } from "@/lib/topNav";

// Colour for every section that's specific to the site you're currently
// inside (the site's own name/pages section, Content, Financial) —
// distinct from the default grey used for Administration/Sites, so it's
// visually obvious which groups are "always there" versus "belong to
// this particular site" (2026-09-02, direct request).
const SITE_SECTION_COLOR = "#635572";

// Which page (within a site) is currently active, for highlighting and
// for deciding which of the four groups the accordion should open on.
// "overview" is the site's own settings/summary page (/sites/[id] with
// nothing more specific); "menu" is the Menu Builder page; "pages" is
// any individual page's own editor (/sites/[id]/pages/[pageId]) — all
// three belong to the site's own section, but only "menu" highlights
// the Menu link itself (an open page editor highlights that page
// within the page list instead, which SiteShell already handles
// locally).
export type SiteNavKey =
  | "overview"
  | "menu"
  | "pages"
  | "hopper"
  | "artworks"
  | "artworkSettings"
  | "galleries"
  | "media"
  | "bucket"
  | "mediaSettings"
  | "sales"
  | "customers"
  | "purchases"
  | "purchasesSettings";

const SITE_INFO_KEYS: SiteNavKey[] = ["overview", "menu", "pages"];

// "galleries" (displayed as "Locations") moved from Financial into
// Content, 2026-08-31 — it's cataloguing data about where artwork
// lives, same family as the Artwork/Media catalogues either side of
// it, not a financial record like Sales or Purchases.
const CONTENT_KEYS: SiteNavKey[] = [
  "hopper",
  "artworks",
  "artworkSettings",
  "galleries",
  "media",
  "bucket",
  "mediaSettings",
];

const FINANCIAL_KEYS: SiteNavKey[] = ["sales", "customers", "purchases", "purchasesSettings"];

export function buildSiteNavEntries({
  siteId,
  siteLabel,
  active,
  alertCount,
  hopperCount,
  bucketCount,
  artworkNeedsReviewCount,
  mediaNeedsReviewCount,
  salesEnabled,
  siteSectionBody,
}: {
  siteId: string;
  // What to label the site's own section with — the site's name, or
  // (2026-09-02) the artist's name as a fallback for the rare site
  // with no name of its own. Resolved by the caller (the layout has
  // both site.name and site.artist.name to hand) rather than here.
  siteLabel: string;
  active: SiteNavKey | null;
  alertCount: number;
  hopperCount: number;
  bucketCount: number;
  artworkNeedsReviewCount: number;
  mediaNeedsReviewCount: number;
  salesEnabled: boolean;
  // The site's own section needs more than plain links (per-page
  // visibility toggles, an inline add-page form) — that part is built
  // by the caller (SiteShell, which holds the client-side state for
  // it) and passed straight through here.
  siteSectionBody: ReactNode;
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
    // "Locations" (was "Galleries", same route — only the label has
    // changed for now) sits here, between Artwork Catalogue and its
    // Settings, per direct request 2026-08-31.
    { label: "Locations", href: `${base}/galleries`, active: active === "galleries" },
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
    { label: "Purchases", href: `${base}/purchases`, active: active === "purchases" },
    {
      label: "Settings",
      href: `${base}/purchases/settings`,
      active: active === "purchasesSettings",
      subtle: true,
    },
  ];

  return [
    // Same "Administration" group as the top-level Accounts pages —
    // none of its own keys apply while inside a site, so it's never
    // the one that auto-opens here.
    buildAccountsSection(null, alertCount),
    // Plain link back to the full Sites list (2026-09-02 — this used to
    // be a section containing the current site's own pages; that's now
    // its own section below, labelled with the site itself, so this one
    // only ever does the one job its label says).
    { label: "Sites", href: "/", active: false },
    {
      label: siteLabel,
      section: true,
      key: "site",
      color: SITE_SECTION_COLOR,
      active: active !== null && SITE_INFO_KEYS.includes(active),
      customChildren: siteSectionBody,
    },
    {
      label: "Content",
      section: true,
      key: "content",
      color: SITE_SECTION_COLOR,
      active: active !== null && CONTENT_KEYS.includes(active),
      children: contentChildren,
    },
    {
      label: "Financial",
      section: true,
      key: "financial",
      color: SITE_SECTION_COLOR,
      active: active !== null && FINANCIAL_KEYS.includes(active),
      children: financialChildren,
    },
  ];
}
