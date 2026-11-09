"use server";

import { requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { getCuration, type CurationDetail } from "@/lib/actions/curations";
import { getPageCanvas } from "@/lib/actions/pageCanvas";
import { getPageComponents } from "@/lib/actions/pageComponents";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { listLiveSiteWorks } from "@/lib/actions/siteSnapshot";
import { listShownExhibitions, type ExhibitionRow } from "@/lib/actions/exhibitions";
import { listProfileStories, type ProfileStoryRow } from "@/lib/actions/profileStories";
import { arrangeItems, contentFits, pageWorks } from "@/lib/pageComponents";
import { readPageStories } from "@/lib/pageStories";
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

// What a page's grid shows (its works, or — on a page without works —
// the Profile entries or exhibitions it shows; Craig, 9 Nov) and whether
// the works' order can be changed:
// - a Showcase page: every work the site shows, shuffled on each visit, so
//   no order;
// - a Block Build page whose works are in one component: its works as
//   arranged on this page, reordered for this page only (Craig, 8 Nov) —
//   `arrange` is that component, with the works it leaves out;
// - the same with a component showing one picture (a Single Image or
//   Picture & words, e.g. Home): "single" — the first is the one shown,
//   and another can be chosen in its place;
// - a page with Profile stories: the entries they show, in their order;
// - a page with Exhibitions: the exhibitions shown, as the page lists them;
// - any other page: its works as shown, in an order set up elsewhere.
export type ArtistAppPageContent =
  | {
      kind: "showcase" | "arrange" | "single" | "fixed";
      works: SiteWork[];
      arrange: { blockId: string; hiddenIds: string[] } | null;
    }
  | { kind: "stories"; stories: ProfileStoryRow[] }
  | { kind: "exhibitions"; exhibitions: ExhibitionRow[] };

const NO_WORKS: ArtistAppPageContent = { kind: "fixed", works: [], arrange: null };

export async function getArtistAppPageContent(siteId: string, pageId: string): Promise<ArtistAppPageContent> {
  const { artistId } = await requireSiteAccess(siteId);
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyleId: true },
  });
  if (!page) return NO_WORKS;

  const style = (await listPageStyles()).find((s) => s.id === page.pageStyleId) ?? null;
  const blocks = style?.type === "BLOCK_BUILD" ? style.layout.blocks : [];
  if (blocks.some((b) => b.type === "showcase")) {
    return { kind: "showcase", works: await listLiveSiteWorks(siteId), arrange: null };
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

  const blockTypes = new Map(blocks.map((b) => [b.id, b.type]));
  const worksComponents = components.filter((c) => {
    const type = blockTypes.get(c.blockId);
    return c.source === "WORKS" && !!type && contentFits(type, "WORKS");
  });
  const curation = curationId ? curations[curationId] : undefined;
  if (curation && worksComponents.length === 1) {
    // All the component's works, even where the page shows only the
    // first, so another can be put first.
    const content = worksComponents[0];
    const type = blockTypes.get(content.blockId);
    const kind = type === "image" || type === "picturewords" ? "single" : "arrange";
    const works = arrangeItems(pageWorks(curation.works, content), (w) => w.artworkId, content).map((w) => ({
      ...w,
      curationId: curation.id,
    }));
    return { kind, works, arrange: { blockId: content.blockId, hiddenIds: content.hiddenIds } };
  }

  const works = pageShownWorks({ curationId, style, components, canvas }, curations);
  if (works.length > 0) return { kind: "fixed", works, arrange: null };

  // No works: the Profile entries its Profile stories show (as the
  // published site — see siteSnapshot), or its exhibitions.
  const storyBlocks = new Set(blocks.filter((b) => b.type === "stories").map((b) => b.id));
  if (storyBlocks.size > 0) {
    const ids = components.filter((c) => storyBlocks.has(c.blockId)).flatMap((c) => readPageStories(c.text));
    const byId = new Map((await listProfileStories(artistId)).map((s) => [s.id, s]));
    const stories = [...new Set(ids.map((s) => s.id))].flatMap((id) => byId.get(id) ?? []);
    return { kind: "stories", stories };
  }
  const exhibitionsBlock = blocks.find((b) => b.type === "exhibitions");
  if (exhibitionsBlock) {
    const shown = await listShownExhibitions(artistId);
    const newestFirst = exhibitionsBlock.exhibitions?.newestFirst !== false;
    return { kind: "exhibitions", exhibitions: newestFirst ? [...shown].reverse() : shown };
  }
  return NO_WORKS;
}
