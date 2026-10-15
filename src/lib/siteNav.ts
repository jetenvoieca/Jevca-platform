import type { AppShellNavEntry, AppShellNavItem } from "@/components/SidebarNav";
import { buildAccountsSection, buildSitesSection, buildTemplatesSection } from "@/lib/topNav";
import type { RecentSite } from "@/lib/recentSites";
import type { ClientWords } from "@/lib/clientKind";

// Colour for every section that's specific to the site you're currently
// inside (Artworks, Website, Financial, Marketing) — distinct from the
// default grey used for Administration/Templates/Sites, so it's
// visually obvious which groups are "always there" versus "belong to
// this particular site". Also reused by the evaluation-only nav
// (lib/previewNav.ts).
export const SITE_SECTION_COLOR = "#635572";

// Which page (within a site) is currently active, for highlighting and
// for deciding which section the accordion opens on.
// "profile" is the site's bare /sites/[id] Owner/Financial/Personal
// Profile page (in Financial); "pages" is the Pages manager
// (/sites/[id]/pages) and anything beneath it.
export type SiteNavKey =
  | "artworks"
  | "curations"
  | "galleries"
  | "artworkSettings"
  | "hopper"
  | "media"
  | "bucket"
  | "pages"
  | "analytics"
  | "account"
  | "sales"
  | "purchases"
  | "customers"
  | "profile"
  | "purchasesSettings"
  | "marketingSettings"
  | "subscribers"
  | "mailCampaigns"
  | "socialMedia"
  | "pr";

const ARTWORK_KEYS: SiteNavKey[] = ["artworks", "curations", "galleries", "artworkSettings"];

const WEBSITE_KEYS: SiteNavKey[] = ["pages", "analytics"];

const FINANCIAL_KEYS: SiteNavKey[] = [
  "account",
  "sales",
  "purchases",
  "customers",
  "profile",
  "purchasesSettings",
];

// Hopper, Media Catalogue and Bucket sit in Marketing (2026-10-15,
// Craig's decision); artworks get their images through Add Artworks.
const MARKETING_KEYS: SiteNavKey[] = [
  "hopper",
  "media",
  "bucket",
  "subscribers",
  "mailCampaigns",
  "socialMedia",
  "pr",
  "marketingSettings",
];

export function buildSiteNavEntries({
  siteId,
  active,
  alertCount,
  salesEnabled,
  recentSites,
  words,
}: {
  siteId: string;
  active: SiteNavKey | null;
  alertCount: number;
  salesEnabled: boolean;
  // This site first, then the one opened before it — see the site layout.
  recentSites: RecentSite[];
  // Artwork or product wording for this site's client — lib/clientKind.ts.
  words: ClientWords;
}): AppShellNavEntry[] {
  const base = `/sites/${siteId}`;

  const artworkChildren: AppShellNavItem[] = [
    { label: "Catalogue", href: `${base}/artworks`, active: active === "artworks" },
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

  // Menus are for navigating only (2026-10-04) — pages are created and
  // managed on the Pages page itself, not inside this section.
  // Analytics is a placeholder for now.
  const websiteChildren: AppShellNavItem[] = [
    { label: "Pages", href: `${base}/pages`, active: active === "pages" },
    { label: "Analytics", href: `${base}/analytics`, active: active === "analytics" },
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

  // Marketing (2026-10-08, from Craig's mockup). Social Media and PR are
  // placeholders for now.
  const marketingBase = `${base}/marketing`;
  const marketingChildren: AppShellNavItem[] = [
    { label: "Hopper", href: `${base}/hopper`, active: active === "hopper" },
    { label: "Media Catalogue", href: `${base}/media`, active: active === "media" },
    { label: "Bucket", href: `${base}/bucket`, active: active === "bucket" },
    {
      label: "Subscribers",
      href: `${marketingBase}/subscribers`,
      active: active === "subscribers",
    },
    {
      label: "Mail Campaigns",
      href: `${marketingBase}/campaigns`,
      active: active === "mailCampaigns",
    },
    { label: "Social Media", href: `${marketingBase}/social`, active: active === "socialMedia" },
    { label: "PR", href: `${marketingBase}/pr`, active: active === "pr" },
    {
      label: "Settings",
      href: `${marketingBase}/settings`,
      active: active === "marketingSettings",
      subtle: true,
    },
  ];

  const sectionActive = (keys: SiteNavKey[]) => active !== null && keys.includes(active);

  return [
    // Same "Administration" and "Templates" groups as the top-level
    // pages — none of their own keys apply while inside a site.
    buildAccountsSection(null, alertCount),
    buildTemplatesSection(null),
    buildSitesSection(recentSites, { currentSiteId: siteId }),
    {
      label: words.items,
      section: true,
      key: "artworks",
      color: SITE_SECTION_COLOR,
      active: sectionActive(ARTWORK_KEYS),
      children: artworkChildren,
    },
    {
      label: "Website",
      section: true,
      key: "website",
      color: SITE_SECTION_COLOR,
      active: sectionActive(WEBSITE_KEYS),
      children: websiteChildren,
    },
    {
      label: "Financial",
      section: true,
      key: "financial",
      color: SITE_SECTION_COLOR,
      active: sectionActive(FINANCIAL_KEYS),
      children: financialChildren,
    },
    {
      label: "Marketing",
      section: true,
      key: "marketing",
      color: SITE_SECTION_COLOR,
      active: sectionActive(MARKETING_KEYS),
      children: marketingChildren,
    },
  ];
}
