"use server";

import { db } from "@/lib/db";
import { isCurationSectionType } from "@/lib/curationSections";
import { contentFits, type ComponentContent, type ContentKind } from "@/lib/pageComponents";
import { blockTypeLabel, normalizeLayout } from "@/lib/pageStyleLayout";

// What fills a Private / Custom page's components (2026-10-07) — see
// lib/pageComponents.ts and PageComponentContent in schema.prisma.
// Scoped by siteId; only the page's own curation's sections can be
// used, and only in a component they fit.

type Result = { ok: true } | { error: string };

// The page's components' content. Anything left from a curation the
// page no longer shows is left out.
export async function getPageComponents(
  siteId: string,
  pageId: string
): Promise<ComponentContent[]> {
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: {
      curationId: true,
      componentContents: {
        select: { blockId: true, sectionId: true, section: { select: { curationId: true } } },
      },
    },
  });
  if (!page) return [];
  return page.componentContents
    .filter((c) => c.sectionId === null || c.section?.curationId === page.curationId)
    .map((c) => ({ blockId: c.blockId, sectionId: c.sectionId }));
}

// Fills one component with a section (or, with `sectionId` null, the
// curation's works), replacing what it held.
export async function setPageComponent(
  siteId: string,
  pageId: string,
  blockId: string,
  sectionId: string | null
): Promise<Result> {
  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { curationId: true, pageStyle: { select: { type: true, layout: true } } },
  });
  if (!page) return { error: "Page not found." };
  if (!page.curationId) return { error: "This page has no curation. Choose one with Edit." };
  if (page.pageStyle?.type !== "PRIVATE") {
    return { error: "Only pages with a Private / Custom Display Style are arranged this way." };
  }
  const style = normalizeLayout("PRIVATE", page.pageStyle.layout);
  if (style.type !== "PRIVATE") return { error: "Page not found." };
  const block = style.layout.blocks.find((b) => b.id === blockId);
  if (!block) return { error: "That component is no longer in the page's Display Style." };

  let kind: ContentKind = "WORKS";
  if (sectionId !== null) {
    const section = await db.curationSection.findFirst({
      where: { id: sectionId, curationId: page.curationId },
      select: { type: true },
    });
    if (!section || !isCurationSectionType(section.type)) {
      return { error: "That section is no longer in the page's curation." };
    }
    kind = section.type;
  }
  if (!contentFits(block.type, kind)) {
    return { error: `That can't go in a ${blockTypeLabel(block.type)} component.` };
  }

  await db.pageComponentContent.upsert({
    where: { pageId_blockId: { pageId, blockId } },
    create: { pageId, blockId, sectionId },
    update: { sectionId },
  });
  return { ok: true };
}

// Empties one component.
export async function clearPageComponent(
  siteId: string,
  pageId: string,
  blockId: string
): Promise<Result> {
  await db.pageComponentContent.deleteMany({ where: { pageId, blockId, page: { siteId } } });
  return { ok: true };
}
