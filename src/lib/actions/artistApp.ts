"use server";

import { requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { getCuration, type CurationDetail } from "@/lib/actions/curations";
import { getPageCanvas } from "@/lib/actions/pageCanvas";
import { getPageComponents } from "@/lib/actions/pageComponents";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listLiveSiteWorks } from "@/lib/actions/siteSnapshot";
import { arrangeItems, contentFits, pageWorks } from "@/lib/pageComponents";
import { pageShownWorks, type SiteWork } from "@/lib/siteWorks";

// The Artist App's Arrange Pages (2026-11-08, Craig's mockup).

export type ArtistAppPage = {
  id: string;
  title: string;
  visible: boolean;
  parentId: string | null;
};

// The site's pages in their order (Live and Hidden together, as saved —
// see reorderPages).
export async function listArtistAppPages(siteId: string): Promise<ArtistAppPage[]> {
  await requireSiteAccess(siteId);
  return db.page.findMany({
    where: { siteId },
    orderBy: { position: "asc" },
    select: { id: true, title: true, visible: true, parentId: true },
  });
}

// What a page's works grid shows and whether its order can be changed:
// - a Showcase page: every work the site shows, shuffled on each visit, so
//   no order;
// - a Block Build page whose works are in one component: its works as
//   arranged on this page, reordered for this page only (Craig, 8 Nov) —
//   `arrange` is that component, with the works it leaves out;
// - any other page: its works as shown, in an order set up elsewhere.
export type ArtistAppPageWorks = {
  works: SiteWork[];
  kind: "showcase" | "arrange" | "fixed";
  arrange: { blockId: string; hiddenIds: string[] } | null;
};

export async function getArtistAppPageWorks(siteId: string, pageId: string): Promise<ArtistAppPageWorks> {
  const { artistId } = await requireSiteAccess(siteId);
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyleId: true },
  });
  if (!page) return { works: [], kind: "fixed", arrange: null };

  const style = (await listPageStyles()).find((s) => s.id === page.pageStyleId) ?? null;
  if (style?.type === "BLOCK_BUILD" && style.layout.blocks.some((b) => b.type === "showcase")) {
    return { works: await listLiveSiteWorks(siteId), kind: "showcase", arrange: null };
  }

  const isCanvas = style?.type === "CANVAS";
  const canvas = isCanvas ? await getPageCanvas(siteId, pageId) : [];
  const components = style?.type === "BLOCK_BUILD" ? await getPageComponents(siteId, pageId) : [];
  const curationId = isCanvas ? null : page.curationId;

  const curations: Record<string, CurationDetail> = {};
  for (const id of new Set([...(curationId ? [curationId] : []), ...canvas.map((c) => c.curationId)])) {
    const detail = await getCuration(id, artistId);
    if (detail) curations[id] = detail;
  }

  const blockTypes = new Map((style?.type === "BLOCK_BUILD" ? style.layout.blocks : []).map((b) => [b.id, b.type]));
  const worksComponents = components.filter((c) => {
    const type = blockTypes.get(c.blockId);
    return c.source === "WORKS" && !!type && contentFits(type, "WORKS");
  });
  const curation = curationId ? curations[curationId] : undefined;
  if (curation && worksComponents.length === 1) {
    // All the component's works, even where the page shows only the
    // first (a Single Image), so any can be put first.
    const content = worksComponents[0];
    const works = arrangeItems(pageWorks(curation.works, content), (w) => w.artworkId, content).map((w) => ({
      ...w,
      curationId: curation.id,
    }));
    return { works, kind: "arrange", arrange: { blockId: content.blockId, hiddenIds: content.hiddenIds } };
  }
  return { works: pageShownWorks({ curationId, style, components, canvas }, curations), kind: "fixed", arrange: null };
}
