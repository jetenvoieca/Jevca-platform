import type { AppShellNavEntry } from "@/components/SidebarNav";
import { SITE_SECTION_COLOR } from "@/lib/siteNav";

export type PreviewNavKey = "artworks" | "hopper" | "galleries" | "sales" | "guides";

// The reduced, evaluation-only nav shown under /preview/<slug>/* — see
// previewSites.ts. Deliberately a fixed, hand-picked list (not a
// filtered version of buildSiteNavEntries) rather than the same menu
// with items hidden: this is a genuinely different, much simpler menu
// with no Administration, Templates, Sites, Media Catalogue, Bucket,
// Customers, Purchases, or the site's own Pages/Menu/Profile section.
//
// "Guides" (2026-09-12) is a placeholder for now — it links to a page
// that just says so; the real read-only guides view is a separate,
// later piece of work.
export function buildPreviewNavEntries({
  basePath,
  active,
  hopperCount,
}: {
  basePath: string;
  active: PreviewNavKey | null;
  hopperCount: number;
}): AppShellNavEntry[] {
  return [
    {
      label: "Content",
      section: true,
      key: "content",
      color: SITE_SECTION_COLOR,
      active: active === "hopper" || active === "artworks" || active === "galleries",
      children: [
        {
          label: "Hopper",
          href: `${basePath}/hopper`,
          active: active === "hopper",
          badge: hopperCount,
        },
        {
          label: "Artwork Catalogue",
          href: `${basePath}/artworks`,
          active: active === "artworks",
        },
        { label: "Locations", href: `${basePath}/galleries`, active: active === "galleries" },
      ],
    },
    { label: "Guides", href: `${basePath}/guides`, active: active === "guides" },
    {
      label: "Financial",
      section: true,
      key: "financial",
      color: SITE_SECTION_COLOR,
      active: active === "sales",
      children: [{ label: "Sales", href: `${basePath}/sales`, active: active === "sales" }],
    },
  ];
}
