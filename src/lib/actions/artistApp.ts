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
import { readContactPanel, type ContactPanelSettings } from "@/lib/contactPanel";
import { pageShownWorks, type SiteWork } from "@/lib/siteWorks";
import { CURATION_SECTION_TYPES } from "@/lib/curationSections";
import { uniquePageSlug } from "@/lib/pageSlugs";

// The Artist App's Arrange Pages (2026-11-08, Craig's mockup).

export type ArtistAppPage = {
  id: string;
  title: string;
  visible: boolean;
  parentId: string | null;
  // Shows a curation (pages under a group that all do can have more
  // added — see addArtistAppGroupPage).
  hasCuration: boolean;
};

// The site's pages in their order (Live and Hidden together, as saved —
// see reorderPages).
export async function listArtistAppPages(siteId: string): Promise<ArtistAppPage[]> {
  await requireSiteAccess(siteId);
  const rows = await db.page.findMany({
    where: { siteId },
    orderBy: { position: "asc" },
    select: { id: true, title: true, visible: true, parentId: true, curationId: true },
  });
  return rows.map(({ curationId, ...p }) => ({ ...p, hasCuration: !!curationId }));
}

// "Add new … page" under a group of curation pages (2026-11-09, Craig's
// mockup — e.g. a new portfolio page): a new curation and a page showing
// it, both named `name`. The page goes under the group, in Hidden Pages
// (so nothing shows on the site until it's moved to Live), and looks like
// the group's first page — its Display Style and menu, and its works
// component(s) (arranged afresh). Returns the new page.
export async function addArtistAppGroupPage(
  siteId: string,
  groupId: string,
  nameRaw: string,
): Promise<ArtistAppPage | { error: string }> {
  const { artistId } = await requireSiteAccess(siteId);
  const name = nameRaw.trim();
  if (!name) return { error: "Give the page a name." };

  const group = await db.page.findFirst({
    where: { id: groupId, siteId, parentId: null },
    select: {
      children: {
        orderBy: { position: "asc" },
        select: {
          curationId: true,
          pageStyleId: true,
          menuStyleId: true,
          componentContents: { where: { source: "WORKS", sectionId: null }, select: { blockId: true } },
        },
      },
    },
  });
  const model = group?.children[0];
  if (!group || !model || group.children.some((c) => !c.curationId)) {
    return { error: "Pages can't be added here." };
  }
  if (await db.curation.findFirst({ where: { artistId, name }, select: { id: true } })) {
    return { error: "A curation with this name already exists — choose another name." };
  }

  const [slug, last] = await Promise.all([
    uniquePageSlug(siteId, name),
    db.page.aggregate({ where: { siteId }, _max: { position: true } }),
  ]);
  const page = await db.$transaction(async (tx) => {
    // Made with its presentation sections, as createCuration.
    const curation = await tx.curation.create({
      data: { artistId, name, sections: { create: CURATION_SECTION_TYPES.map((t) => ({ type: t.value })) } },
      select: { id: true },
    });
    return tx.page.create({
      data: {
        siteId,
        title: name,
        slug,
        visible: false,
        position: (last._max.position ?? -1) + 1,
        parentId: groupId,
        curationId: curation.id,
        pageStyleId: model.pageStyleId,
        menuStyleId: model.menuStyleId,
        componentContents: {
          create: model.componentContents.map((c) => ({
            blockId: c.blockId,
            source: "WORKS" as const,
            sectionId: null,
            hiddenIds: [],
            orderIds: [],
          })),
        },
      },
      select: { id: true, title: true, visible: true, parentId: true },
    });
  });
  return { ...page, hasCuration: true };
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
// - the Contact panel page: its panel's settings, to draw the form;
// - any other page: its works as shown, in an order set up elsewhere.
export type ArtistAppPageContent =
  | {
      kind: "showcase" | "arrange" | "single" | "fixed";
      works: SiteWork[];
      arrange: { blockId: string; hiddenIds: string[] } | null;
    }
  | { kind: "stories"; stories: ProfileStoryRow[] }
  | { kind: "exhibitions"; exhibitions: ExhibitionRow[] }
  | { kind: "contact"; settings: ContactPanelSettings };

const NO_WORKS: ArtistAppPageContent = { kind: "fixed", works: [], arrange: null };

export async function getArtistAppPageContent(siteId: string, pageId: string): Promise<ArtistAppPageContent> {
  const { artistId } = await requireSiteAccess(siteId);
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyleId: true, contactPanel: true },
  });
  if (!page) return NO_WORKS;
  const contactPanel = readContactPanel(page.contactPanel);
  if (contactPanel) return { kind: "contact", settings: contactPanel };

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
