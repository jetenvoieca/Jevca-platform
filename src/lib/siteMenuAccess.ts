import type { SiteNavKey } from "@/lib/siteNav";

// Which of a site's menu items an artist login may reach (2026-10-26,
// artist logins stage 2): ticked per client on the Client page
// (Artist.menuAccess), applying to all that client's sites. An admin
// reaches everything. Administration and Templates are never offered —
// they're admin only. Plain module, shared by the Client page, the menu
// and the site's layout (which refuses the rest).

// The site's menu, as the Client page lists it to tick: each section's
// items, in menu order. `artworks` is relabelled by the client's words
// where it's shown.
export const SITE_MENU: {
  section: string;
  items: { key: SiteNavKey; label: string }[];
}[] = [
  {
    section: "Artworks",
    items: [
      { key: "artworks", label: "Catalogue" },
      { key: "profileCatalogue", label: "Profile Catalogue" },
      { key: "curations", label: "Curations" },
      { key: "galleries", label: "Locations" },
      { key: "artworkSettings", label: "Settings" },
    ],
  },
  { section: "Website", items: [{ key: "pages", label: "Pages" }] },
  {
    section: "Financial",
    items: [
      { key: "account", label: "Account" },
      { key: "sales", label: "Sales" },
      { key: "purchases", label: "Purchases" },
      { key: "customers", label: "Customers" },
      { key: "profile", label: "Profile" },
      { key: "purchasesSettings", label: "Settings" },
    ],
  },
  {
    section: "Marketing",
    items: [
      { key: "hopper", label: "Hopper" },
      { key: "media", label: "Media Catalogue" },
      { key: "bucket", label: "Video Edit" },
      { key: "subscribers", label: "Subscribers" },
      { key: "mailCampaigns", label: "Mail Campaigns" },
      { key: "socialMedia", label: "Social Media" },
      { key: "pr", label: "PR" },
      { key: "analytics", label: "Analytics" },
      { key: "marketingSettings", label: "Settings" },
    ],
  },
];

const ALL_KEYS = SITE_MENU.flatMap((s) => s.items.map((i) => i.key));

// The ticked items as saved: known keys only, each once, in menu order.
export function cleanMenuAccess(raw: unknown): SiteNavKey[] {
  const ticked = new Set(
    Array.isArray(raw)
      ? raw.filter((k): k is string => typeof k === "string")
      : [],
  );
  return ALL_KEYS.filter((k) => ticked.has(k));
}

// The menu item a page of a site belongs to, from its address — null for
// anything outside the menu. (Moved here from SiteShell, 2026-10-26, so
// the site's layout can refuse what an artist may not reach.)
export function siteNavKeyForPath(
  pathname: string,
  siteId: string,
): SiteNavKey | null {
  const base = `/sites/${siteId}`;
  if (pathname === base) return "profile";
  if (pathname === `${base}/artworks/settings`) return "artworkSettings";
  if (pathname.startsWith(`${base}/artworks`)) return "artworks";
  if (pathname.startsWith(`${base}/profile-catalogue`))
    return "profileCatalogue";
  if (pathname.startsWith(`${base}/curations`)) return "curations";
  if (pathname.startsWith(`${base}/galleries`)) return "galleries";
  if (pathname.startsWith(`${base}/media`)) return "media";
  if (pathname === `${base}/hopper`) return "hopper";
  if (pathname === `${base}/bucket`) return "bucket";
  if (pathname.startsWith(`${base}/pages`)) return "pages";
  if (pathname.startsWith(`${base}/analytics`)) return "analytics";
  if (pathname.startsWith(`${base}/account`)) return "account";
  if (pathname.startsWith(`${base}/sales`)) return "sales";
  if (pathname.startsWith(`${base}/purchases/settings`))
    return "purchasesSettings";
  if (pathname.startsWith(`${base}/purchases`)) return "purchases";
  if (pathname.startsWith(`${base}/customers`)) return "customers";
  if (pathname.startsWith(`${base}/marketing/subscribers`))
    return "subscribers";
  if (pathname.startsWith(`${base}/marketing/campaigns`))
    return "mailCampaigns";
  if (pathname.startsWith(`${base}/marketing/social`)) return "socialMedia";
  if (pathname.startsWith(`${base}/marketing/pr`)) return "pr";
  if (pathname.startsWith(`${base}/marketing/settings`))
    return "marketingSettings";
  return null;
}

// Each menu item's address within a site.
const PATHS: Record<SiteNavKey, string> = {
  profile: "",
  artworks: "/artworks",
  artworkSettings: "/artworks/settings",
  profileCatalogue: "/profile-catalogue",
  curations: "/curations",
  galleries: "/galleries",
  media: "/media",
  hopper: "/hopper",
  bucket: "/bucket",
  pages: "/pages",
  analytics: "/analytics",
  account: "/account",
  sales: "/sales",
  purchases: "/purchases",
  purchasesSettings: "/purchases/settings",
  customers: "/customers",
  subscribers: "/marketing/subscribers",
  mailCampaigns: "/marketing/campaigns",
  socialMedia: "/marketing/social",
  pr: "/marketing/pr",
  marketingSettings: "/marketing/settings",
};

export function siteNavHref(siteId: string, key: SiteNavKey): string {
  return `/sites/${siteId}${PATHS[key]}`;
}

// Where someone opening a site lands: its Catalogue, or for an artist
// login the first item ticked for them (null = nothing ticked).
export function siteLandingHref(
  siteId: string,
  allowed: SiteNavKey[] | null,
): string | null {
  if (!allowed) return siteNavHref(siteId, "artworks");
  return allowed.length ? siteNavHref(siteId, allowed[0]) : null;
}
