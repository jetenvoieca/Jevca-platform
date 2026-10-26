"use server";

import { requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { MAX_SECTION_TEXT } from "@/lib/curationSections";
import {
  contentFits,
  hasTypedWords,
  isTypedContent,
  maxTypedLength,
  readHeroText,
  writeHeroText,
  type ComponentContent,
  type ContentKind,
} from "@/lib/pageComponents";
import { blockTypeLabel, normalizeLayout, type LayoutBlock } from "@/lib/pageStyleLayout";
import { readEntries, writeEntries } from "@/lib/pageEntries";
import { readPageStories, writePageStories } from "@/lib/pageStories";
import { readHeadingText, writeHeadingText } from "@/lib/pageHeading";

// What fills a Block Build page's components (2026-10-07; 2026-10-13) —
// see lib/pageComponents.ts and PageComponentContent in schema.prisma.
// Scoped by siteId; only the page's own curation's sections can be
// used, and only in a component they fit. Every change saves straight
// away from the page's Arrange.

type Result = { ok: true } | { error: string };

const CONTENT_SELECT = {
  blockId: true,
  source: true,
  sectionId: true,
  text: true,
  hiddenIds: true,
  orderIds: true,
  unsoldOnly: true,
} as const;

// The page's components' content. Anything left from a curation the
// page no longer shows is left out.
export async function getPageComponents(siteId: string, pageId: string): Promise<ComponentContent[]> {
  await requireSiteAccess(siteId);
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: {
      curationId: true,
      componentContents: {
        select: { ...CONTENT_SELECT, section: { select: { curationId: true } } },
      },
    },
  });
  if (!page) return [];
  return page.componentContents
    .filter((c) => c.source !== "SECTION" || c.section?.curationId === page.curationId)
    .map((c) => ({
      blockId: c.blockId,
      source: c.source,
      sectionId: c.sectionId,
      text: c.text,
      hiddenIds: c.hiddenIds,
      orderIds: c.orderIds,
      unsoldOnly: c.unsoldOnly,
    }));
}

// The page and one component of its Display Style, checked: the page is
// this site's and has a Block Build style holding the component. Its
// curation, if it has one (2026-10-26: a page needs none).
async function pageBlock(
  siteId: string,
  pageId: string,
  blockId: string,
): Promise<{ curationId: string | null; block: LayoutBlock } | { error: string }> {
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyle: { select: { type: true, layout: true } } },
  });
  if (!page) return { error: "Page not found." };
  if (page.pageStyle?.type !== "BLOCK_BUILD") {
    return { error: "Only pages with a Block Build Display Style are arranged this way." };
  }
  const style = normalizeLayout("BLOCK_BUILD", page.pageStyle.layout);
  if (style.type !== "BLOCK_BUILD") return { error: "Page not found." };
  const block = style.layout.blocks.find((b) => b.id === blockId);
  if (!block) return { error: "That component is no longer in the page's Display Style." };
  return { curationId: page.curationId, block };
}

// Fills one component with a section of the page's curation (or, with
// `sectionId` null, its works — `unsoldOnly`: only the unsold ones),
// replacing what it held.
export async function setPageComponent(
  siteId: string,
  pageId: string,
  blockId: string,
  sectionId: string | null,
  unsoldOnly: boolean,
): Promise<Result> {
  await requireSiteAccess(siteId);
  const found = await pageBlock(siteId, pageId, blockId);
  if ("error" in found) return found;
  // A page needs no curation (2026-10-26) — only to show one's works or
  // sections.
  if (!found.curationId) return { error: "This page has no curation. Choose one with Edit." };

  let kind: ContentKind = "WORKS";
  if (sectionId !== null) {
    const section = await db.curationSection.findFirst({
      where: { id: sectionId, curationId: found.curationId },
      select: { type: true },
    });
    if (!section) return { error: "That section is no longer in the page's curation." };
    kind = section.type;
  }
  if (!contentFits(found.block.type, kind)) {
    return { error: `That can't go in a ${blockTypeLabel(found.block.type)} component.` };
  }

  const data = {
    source: sectionId === null ? ("WORKS" as const) : ("SECTION" as const),
    sectionId,
    hiddenIds: [],
    orderIds: [],
    unsoldOnly: sectionId === null && unsoldOnly,
  };
  // A Hero (2026-10-22) or Picture & words (2026-10-24) keeps the words
  // typed on it.
  const keepText = hasTypedWords(found.block.type);
  await db.pageComponentContent.upsert({
    where: { pageId_blockId: { pageId, blockId } },
    create: { pageId, blockId, ...data, text: null },
    update: keepText ? data : { ...data, text: null },
  });
  return { ok: true };
}

// Moves one component's content, with its choices (edited text, works
// removed, order), to another component it fits, replacing what that
// one held.
export async function movePageComponent(
  siteId: string,
  pageId: string,
  fromBlockId: string,
  toBlockId: string,
): Promise<Result> {
  await requireSiteAccess(siteId);
  const found = await pageBlock(siteId, pageId, toBlockId);
  if ("error" in found) return found;
  const row = await db.pageComponentContent.findFirst({
    where: { pageId, blockId: fromBlockId },
    select: { id: true, source: true, section: { select: { type: true } } },
  });
  if (!row) return { error: "That component is empty." };
  const kind: ContentKind | undefined = row.source === "SECTION" ? row.section?.type : row.source;
  if (!kind || !contentFits(found.block.type, kind)) {
    return { error: `That can't go in a ${blockTypeLabel(found.block.type)} component.` };
  }
  await db.$transaction([
    db.pageComponentContent.deleteMany({ where: { pageId, blockId: toBlockId } }),
    db.pageComponentContent.update({ where: { id: row.id }, data: { blockId: toBlockId } }),
  ]);
  return { ok: true };
}

// Saves a component's text: a Header's, Byline's or (2026-10-24) Text's
// typed text (blank empties it), an Entries list (2026-10-24), or a
// Description's text for this page only (null = back to the curation's
// own).
export async function setPageComponentText(
  siteId: string,
  pageId: string,
  blockId: string,
  textRaw: string | null,
): Promise<Result> {
  await requireSiteAccess(siteId);
  const found = await pageBlock(siteId, pageId, blockId);
  if ("error" in found) return found;
  const text = textRaw === null ? null : textRaw.trim();

  // A Hero's or Picture & words's words (JSON — see readHeroText);
  // typing into an empty one fills it with the curation's works, which a
  // Picture & words's Supporting Media can then replace.
  if (hasTypedWords(found.block.type)) {
    const heroText = writeHeroText(readHeroText(text));
    await db.pageComponentContent.upsert({
      where: { pageId_blockId: { pageId, blockId } },
      create: { pageId, blockId, source: "WORKS", sectionId: null, text: heroText, hiddenIds: [], orderIds: [] },
      update: { text: heroText },
    });
    return { ok: true };
  }

  // Entries (2026-10-24), a Page heading's typed lines (2026-10-25) and
  // Profile stories (2026-10-26), as JSON (see lib/pageEntries.ts,
  // lib/pageHeading.ts, lib/pageStories.ts) — nothing in them empties
  // the component.
  const type = found.block.type;
  if (type === "entries" || type === "pageheading" || type === "stories") {
    const json =
      type === "entries"
        ? writeEntries(readEntries(text))
        : type === "stories"
          ? writePageStories(readPageStories(text))
          : writeHeadingText(readHeadingText(text));
    if (!json) {
      await db.pageComponentContent.deleteMany({ where: { pageId, blockId } });
      return { ok: true };
    }
    const data = { source: "TYPED" as const, sectionId: null, text: json, hiddenIds: [], orderIds: [] };
    await db.pageComponentContent.upsert({
      where: { pageId_blockId: { pageId, blockId } },
      create: { pageId, blockId, ...data },
      update: data,
    });
    return { ok: true };
  }

  const current = await db.pageComponentContent.findUnique({
    where: { pageId_blockId: { pageId, blockId } },
    select: { source: true },
  });
  if (isTypedContent(found.block.type, current)) {
    if (!text) {
      await db.pageComponentContent.deleteMany({ where: { pageId, blockId } });
      return { ok: true };
    }
    const max = maxTypedLength(found.block.type);
    if (text.length > max) {
      return {
        error: `A ${blockTypeLabel(found.block.type).toLowerCase()} can be at most ${max.toLocaleString("en-GB")} characters.`,
      };
    }
    const data = {
      source: "TYPED" as const,
      sectionId: null,
      text,
      hiddenIds: [],
      orderIds: [],
    };
    await db.pageComponentContent.upsert({
      where: { pageId_blockId: { pageId, blockId } },
      create: { pageId, blockId, ...data },
      update: data,
    });
    return { ok: true };
  }

  if (text && text.length > MAX_SECTION_TEXT) {
    return {
      error: `A description can be at most ${MAX_SECTION_TEXT.toLocaleString("en-GB")} characters.`,
    };
  }
  const updated = await db.pageComponentContent.updateMany({
    where: { pageId, blockId, source: "SECTION", section: { type: "DESCRIPTION" } },
    data: { text },
  });
  if (updated.count === 0) return { error: "That component doesn't hold the Description." };
  return { ok: true };
}

// Saves which works or Supporting Media a component shows on this page:
// those removed, and the order chosen.
export async function setPageComponentItems(
  siteId: string,
  pageId: string,
  blockId: string,
  items: { hiddenIds: string[]; orderIds: string[] },
): Promise<Result> {
  await requireSiteAccess(siteId);
  const found = await pageBlock(siteId, pageId, blockId);
  if ("error" in found) return found;
  const updated = await db.pageComponentContent.updateMany({
    where: {
      pageId,
      blockId,
      OR: [{ source: "WORKS" }, { source: "SECTION", section: { type: "IMAGES" } }],
    },
    data: {
      hiddenIds: [...new Set(items.hiddenIds)],
      orderIds: [...new Set(items.orderIds)],
    },
  });
  if (updated.count === 0) return { error: "That component doesn't hold works or images." };
  return { ok: true };
}

// Empties one component.
export async function clearPageComponent(siteId: string, pageId: string, blockId: string): Promise<Result> {
  await requireSiteAccess(siteId);
  await db.pageComponentContent.deleteMany({ where: { pageId, blockId, page: { siteId } } });
  return { ok: true };
}
