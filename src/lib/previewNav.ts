import type { AppShellNavEntry } from "@/components/SidebarNav";
import { SITE_SECTION_COLOR } from "@/lib/siteNav";
import type { ClientWords } from "@/lib/clientKind";

export type PreviewNavKey = "artworks" | "hopper" | "galleries" | "sales" | "guides";

// The reduced, evaluation-only nav shown under /preview/<slug>/* — see
// previewSites.ts. Deliberately a fixed, hand-picked list (not a
// filtered version of buildSiteNavEntries): a genuinely different, much
// simpler menu, laid out in the same Artworks / Media / Financial
// grouping as the full per-site nav.
//
// "Guides" (2026-09-12) is a placeholder for now — it links to a page
// that just says so; the real read-only guides view is later work.
export function buildPreviewNavEntries({
  basePath,
  active,
  hopperCount,
  words,
}: {
  basePath: string;
  active: PreviewNavKey | null;
  hopperCount: number;
  words: ClientWords;
}): AppShellNavEntry[] {
  return [
    {
      label: words.items,
      section: true,
      key: "artworks",
      color: SITE_SECTION_COLOR,
      active: active === "artworks" || active === "galleries",
      children: [
        { label: "Catalogue", href: `${basePath}/artworks`, active: active === "artworks" },
        { label: "Locations", href: `${basePath}/galleries`, active: active === "galleries" },
      ],
    },
    {
      label: "Media",
      section: true,
      key: "media",
      color: SITE_SECTION_COLOR,
      active: active === "hopper",
      children: [
        {
          label: "Hopper",
          href: `${basePath}/hopper`,
          active: active === "hopper",
          badge: hopperCount,
        },
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
