import type { AppShellNavEntry } from "@/components/SidebarNav";
import { SITE_SECTION_COLOR } from "@/lib/siteNav";
import type { ClientWords } from "@/lib/clientKind";

export type PreviewNavKey = "artworks" | "curations" | "galleries" | "guides";

// The artists' version (2026-10-15 — the simplest one): the nav shown
// under /preview/<slug>/* — see previewSites.ts. Just the Artworks
// section: Catalogue (with its Add Artworks page), Curations and
// Locations — and Guides beneath it (back 2026-10-20, Craig's request):
// the User guides from Administration → Guides, read-only.
export function buildPreviewNavEntries({
  basePath,
  active,
  words,
}: {
  basePath: string;
  active: PreviewNavKey | null;
  words: ClientWords;
}): AppShellNavEntry[] {
  return [
    {
      label: words.items,
      section: true,
      key: "artworks",
      color: SITE_SECTION_COLOR,
      active: active === "artworks" || active === "curations" || active === "galleries",
      children: [
        { label: "Catalogue", href: `${basePath}/artworks`, active: active === "artworks" },
        { label: "Curations", href: `${basePath}/curations`, active: active === "curations" },
        { label: "Locations", href: `${basePath}/galleries`, active: active === "galleries" },
      ],
    },
    { label: "Guides", href: `${basePath}/guides`, active: active === "guides", color: SITE_SECTION_COLOR },
  ];
}
