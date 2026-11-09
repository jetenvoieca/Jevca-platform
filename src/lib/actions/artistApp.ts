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
import { readLocations, type LocationSummary } from "@/lib/artworkSettingsData";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import { pageShownWorks, type SiteWork } from "@/lib/siteWorks";
import { CURATION_SECTION_TYPES } from "@/lib/curationSections";
import { uniquePageSlug } from "@/lib/pageSlugs";
import { createArtworkWithRetry } from "@/lib/actions/artworks";
import { ARTWORK_IMAGE_SELECT, toArtworkImage, type ArtworkImage } from "@/lib/artworkImages";
import { isCurrency } from "@/lib/currencies";
import { getArtistDefaultCurrency } from "@/lib/primarySite";

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
// component(s) (arranged afresh). Not once the group has the pages the
// site's plan allows (2026-11-09). Returns the new page.
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
  const { pagesPerGroup } = await readSiteFeatures(siteId);
  if (pagesPerGroup !== null && group.children.length >= pagesPerGroup) {
    return { error: `This group already has its ${pagesPerGroup} pages.` };
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
// - a page with Exhibitions: the exhibitions shown, as the page lists them,
//   and the artist's Locations (venues, for the exhibition window);
// - the Contact panel page: its panel's settings, to draw the form;
// - any other page: its works as shown, in an order set up elsewhere.
export type ArtistAppPageContent =
  | {
      kind: "showcase" | "arrange" | "single" | "fixed";
      works: SiteWork[];
      // The component, the works it leaves out, and the curation it shows.
      arrange: { blockId: string; hiddenIds: string[]; curationId: string } | null;
    }
  | { kind: "stories"; stories: ProfileStoryRow[] }
  | { kind: "exhibitions"; exhibitions: ExhibitionRow[]; locations: LocationSummary[] }
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
    return {
      kind,
      works,
      arrange: { blockId: content.blockId, hiddenIds: content.hiddenIds, curationId: curation.id },
    };
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
    const [shown, locations] = await Promise.all([listShownExhibitions(artistId), readLocations(artistId)]);
    const newestFirst = exhibitionsBlock.exhibitions?.newestFirst !== false;
    return { kind: "exhibitions", exhibitions: newestFirst ? [...shown].reverse() : shown, locations };
  }
  return NO_WORKS;
}

// "Add new work" in the Artist App's artwork picker (2026-11-09, Craig's
// mockup): a new work, filled in like a curation's Presentation, made
// only when the form's Add is pressed.

const MAX_NEW_WORK_IMAGES = 4;

// The pictures chosen for it so far, as the picture editor shows them
// (nothing is saved).
export async function describeArtistAppImages(
  siteId: string,
  imageIds: string[],
): Promise<{ images: ArtworkImage[] } | { error: string }> {
  const { artistId } = await requireSiteAccess(siteId);
  const ids = [...new Set(imageIds)];
  if (ids.length > MAX_NEW_WORK_IMAGES) return { error: `A work can have at most ${MAX_NEW_WORK_IMAGES} pictures.` };
  const rows = await db.image.findMany({ where: { id: { in: ids }, artistId }, select: ARTWORK_IMAGE_SELECT });
  if (rows.length !== ids.length) return { error: "One of those pictures couldn't be found." };
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { images: ids.map((id) => toArtworkImage(byId.get(id)!)) };
}

// The currency a new work's price starts in: the client's default.
export async function artistAppDefaultCurrency(siteId: string): Promise<string> {
  const { artistId } = await requireSiteAccess(siteId);
  return getArtistDefaultCurrency(artistId);
}

// Makes the work: a new Catalogue entry (name, description, full price;
// its first picture as the Catalogue's main picture, where it can be),
// added to the end of `curationId` with this curation's own description
// and — when it has more than that one picture — its pictures.
export async function createArtistAppWork(
  siteId: string,
  curationId: string,
  input: { name: string; description: string; price: string; currency: string; imageIds: string[] },
): Promise<{ ok: true } | { error: string }> {
  const { artistId } = await requireSiteAccess(siteId);
  const name = input.name.trim();
  if (!name) return { error: "Give the work a name." };
  const priceText = input.price.replace(/,/g, "").trim();
  const amount = priceText ? Number(priceText) : null;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return { error: "Enter a valid price." };
  if (!isCurrency(input.currency)) return { error: "That currency isn't supported." };
  const description = input.description.trim();

  const curation = await db.curation.findFirst({ where: { id: curationId, artistId }, select: { id: true } });
  if (!curation) return { error: "This page's curation wasn't found." };
  const imageIds = [...new Set(input.imageIds)];
  if (imageIds.length > MAX_NEW_WORK_IMAGES) return { error: `A work can have at most ${MAX_NEW_WORK_IMAGES} pictures.` };
  const images = await db.image.findMany({
    where: { id: { in: imageIds }, artistId },
    select: { id: true, kind: true, mainImageOfArtwork: { select: { id: true } } },
  });
  if (images.length !== imageIds.length) return { error: "One of those pictures couldn't be found." };

  // The Catalogue's main picture: the first, if it's a photo no other work
  // has as its main picture.
  const first = images.find((i) => i.id === imageIds[0]);
  const mainImageId = first && first.kind === "PHOTO" && !first.mainImageOfArtwork ? first.id : null;
  const offeredPrice = amount != null ? amount.toFixed(2) : null;

  const artwork = await createArtworkWithRetry(artistId, {
    catalogueName: name,
    description: description || null,
    offeredPrice,
    presentationPrice: offeredPrice != null ? Number(offeredPrice) : null,
    priceCurrency: input.currency,
  });
  // Its own pictures in this curation unless they're just the Catalogue's.
  const ownImages = imageIds.length > 0 && !(imageIds.length === 1 && mainImageId);
  const last = await db.curationItem.findFirst({
    where: { curationId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await db.$transaction([
    ...(mainImageId
      ? [
          db.artwork.update({ where: { id: artwork.id }, data: { mainImageId } }),
          db.image.update({ where: { id: mainImageId }, data: { status: "SORTED" } }),
        ]
      : []),
    db.curationItem.create({
      data: {
        curationId,
        artworkId: artwork.id,
        position: (last?.position ?? -1) + 1,
        description: description || null,
        ownImages,
        images: ownImages ? { create: imageIds.map((imageId, position) => ({ imageId, position })) } : undefined,
      },
    }),
  ]);
  return { ok: true };
}

// A work dragged from a page onto another page in the lists (2026-11-09,
// Craig). Onto a page showing one picture (e.g. Home): copied — made the
// picture the page shows (first in its order there) and kept in that
// page's curation; the work stays where it was. Such a page that shares
// its curation with another page (or has none) is first given its own,
// named after it (Craig, 9 Nov), so the other page is never changed.
// Onto any other page: moved from `fromCurationId` to the end of that
// page's curation (left where it is there if it's already in it). The
// work itself is untouched.
export async function dropArtistAppWork(
  siteId: string,
  fromCurationId: string,
  toPageId: string,
  artworkId: string,
): Promise<{ ok: true; copied: boolean } | { error: string }> {
  const { artistId } = await requireSiteAccess(siteId);
  const [from, toPage] = await Promise.all([
    db.curationItem.findFirst({
      where: { curationId: fromCurationId, artworkId, curation: { artistId } },
      select: { id: true },
    }),
    db.page.findFirst({
      where: { id: toPageId, siteId },
      select: { title: true, curationId: true, pageStyleId: true },
    }),
  ]);
  if (!from) return { error: "That work is no longer on this page." };
  if (!toPage) return { error: "That page wasn't found." };

  // The target's one works component, if it shows a single picture.
  const style = (await listPageStyles()).find((st) => st.id === toPage.pageStyleId);
  const blockTypes = new Map((style?.type === "BLOCK_BUILD" ? style.layout.blocks : []).map((b) => [b.id, b.type]));
  const worksComponents = (await getPageComponents(siteId, toPageId)).filter((c) => {
    const type = blockTypes.get(c.blockId);
    return c.source === "WORKS" && !!type && contentFits(type, "WORKS");
  });
  const onlyType = worksComponents.length === 1 ? blockTypes.get(worksComponents[0].blockId) : undefined;
  const single = onlyType === "image" || onlyType === "picturewords" ? worksComponents[0] : null;

  if (single) {
    const shared =
      !toPage.curationId ||
      (await db.page.count({ where: { curationId: toPage.curationId, id: { not: toPageId } } })) > 0;
    if (shared) {
      const name = await freeCurationName(artistId, toPage.title);
      await db.$transaction(async (tx) => {
        const curation = await tx.curation.create({
          data: {
            artistId,
            name,
            sections: { create: CURATION_SECTION_TYPES.map((t) => ({ type: t.value })) },
            items: { create: [{ artworkId, position: 0 }] },
          },
          select: { id: true },
        });
        // What belonged to the old curation goes, as a change of curation
        // in Pages does.
        await tx.pageComponentContent.deleteMany({ where: { pageId: toPageId, source: "SECTION" } });
        await tx.pageComponentContent.updateMany({
          where: { pageId: toPageId, source: "WORKS" },
          data: { hiddenIds: [], orderIds: [artworkId] },
        });
        await tx.page.update({ where: { id: toPageId }, data: { curationId: curation.id } });
      });
      return { ok: true, copied: true };
    }
    await db.$transaction([
      ...(await addToCurationEnd(toPage.curationId!, artworkId)),
      db.pageComponentContent.updateMany({
        where: { pageId: toPageId, blockId: single.blockId, source: "WORKS" },
        data: {
          hiddenIds: single.hiddenIds.filter((id) => id !== artworkId),
          orderIds: [artworkId, ...single.orderIds.filter((id) => id !== artworkId)],
        },
      }),
    ]);
    return { ok: true, copied: true };
  }

  const toCurationId = toPage.curationId;
  if (!toCurationId) return { error: "That page doesn't show works that can be put there." };
  if (toCurationId === fromCurationId) return { ok: true, copied: false };
  await db.$transaction([
    ...(await addToCurationEnd(toCurationId, artworkId)),
    db.curationItem.delete({ where: { id: from.id } }),
  ]);
  return { ok: true, copied: false };
}

// Adding a work to the end of a curation — nothing if it's already in it.
async function addToCurationEnd(curationId: string, artworkId: string) {
  const [already, last] = await Promise.all([
    db.curationItem.findFirst({ where: { curationId, artworkId }, select: { id: true } }),
    db.curationItem.findFirst({ where: { curationId }, orderBy: { position: "desc" }, select: { position: true } }),
  ]);
  return already
    ? []
    : [db.curationItem.create({ data: { curationId, artworkId, position: (last?.position ?? -1) + 1 } })];
}

// A curation name not yet used by the client: `wanted`, else "wanted 2"…
async function freeCurationName(artistId: string, wanted: string): Promise<string> {
  const base = wanted.trim() || "Page";
  const taken = new Set(
    (await db.curation.findMany({ where: { artistId, name: { startsWith: base } }, select: { name: true } })).map(
      (c) => c.name,
    ),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
