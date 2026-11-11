import type { CurationDetail, CurationWork } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import { arrangeItems, contentFits, pageWorks, type ComponentContent } from "@/lib/pageComponents";

// Every work a site shows (2026-11-02, for a Showcase — the ISYT sites'
// showcase pages), each once, with the curation it's shown in (whose
// presentation it opens with). Plain module, not "use server", so the
// published site (from its snapshot) and the admin preview (live, see
// listLiveSiteWorks) work it out the same way.
//
// A work is shown when one of the site's live pages shows it:
// - a Block Build page: the works its components show, as arranged on
//   the page (works removed there, or sold ones on an "Unsold works"
//   component, left out) — a Single Image or Picture & words shows only
//   its first;
// - a Canvas page: all the works of its placed curations;
// - a page with no Display Style: all its curation's works.
// In the pages' order; works without a picture are left out.

export type SiteWork = CurationWork & { curationId: string };

export type SiteWorksPage = {
  curationId: string | null;
  style: PageStyleSummary | null;
  components: ComponentContent[];
  canvas: { curationId: string }[];
};

export function siteWorks(pages: SiteWorksPage[], curations: Record<string, CurationDetail>): SiteWork[] {
  const out = new Map<string, SiteWork>();
  for (const page of pages) {
    for (const w of pageShownWorks(page, curations)) {
      if (!out.has(w.artworkId) && (w.displayUrl || w.imageUrl)) out.set(w.artworkId, w);
    }
  }
  return [...out.values()];
}

// The works one page shows, in its order (see the rules above; a work
// can appear more than once, and works without a picture are kept). Also
// the Artist App's page grid (2026-11-08).
export function pageShownWorks(page: SiteWorksPage, curations: Record<string, CurationDetail>): SiteWork[] {
  const tag = (curationId: string, works: CurationWork[]) => works.map((w) => ({ ...w, curationId }));

  if (page.style?.type === "CANVAS") {
    return page.canvas.flatMap((c) => tag(c.curationId, curations[c.curationId]?.works ?? []));
  }
  const curation = page.curationId ? curations[page.curationId] : undefined;
  if (!curation) return [];
  if (page.style?.type !== "BLOCK_BUILD") return tag(curation.id, curation.works);

  const blocks = new Map(page.style.layout.blocks.map((b) => [b.id, b.type]));
  const all = page.components.flatMap((content) => {
    const type = blocks.get(content.blockId);
    if (!type || content.source !== "WORKS" || !contentFits(type, "WORKS")) return [];
    const shown = arrangeItems(pageWorks(curation.works, content), (w) => w.artworkId, content);
    return tag(curation.id, type === "image" || type === "picturewords" ? shown.slice(0, 1) : shown);
  });
  // Each work once, where it first shows — e.g. a Hero and a Gallery of
  // the same curation (2026-11-11: the Artist App listed them twice).
  const seen = new Set<string>();
  return all.filter((w) => !seen.has(w.artworkId) && !!seen.add(w.artworkId));
}
