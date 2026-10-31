"use server";

import { getCurrentUser, requireSiteAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { listProfileStories } from "@/lib/actions/profileStories";
import { readPageStories } from "@/lib/pageStories";
import { getSiteArtist } from "@/lib/actions/siteArtist";
import {
  getCuration,
  getCurationWorkPresentation,
  listCurationCovers,
  type CurationWorkPresentation,
} from "@/lib/actions/curations";
import { listCurationSections } from "@/lib/actions/curationSections";
import { getPageCanvas } from "@/lib/actions/pageCanvas";
import { getPageComponents } from "@/lib/actions/pageComponents";
import { getPageSignupForms } from "@/lib/actions/signupForms";
import { listPageStyles } from "@/lib/actions/pageStyles";
import { normalizeMenuStyle, type MenuStyleLayout } from "@/lib/menuStyleLayout";
import { syncTurnstileDomains } from "@/lib/turnstile";
import {
  SNAPSHOT_VERSION,
  type PublishResult,
  type SiteSnapshot,
  type SnapshotCuration,
  type SnapshotPage,
} from "@/lib/siteSnapshot";

// Publishing a site (2026-10-06) — see lib/siteSnapshot.ts. The whole
// site at once: its Live Pages in order, each with its Display Style,
// curation or canvas placements, what fills its components (Block
// Build, 2026-10-07), and every curation those show, with their works,
// sections and each work's presentation, and the menu each page shows
// (2026-10-06 — the page's own, or else the site's).

async function buildSiteSnapshot(siteId: string): Promise<SiteSnapshot | null> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      artistId: true,
      menuStyleId: true,
      pages: {
        where: { visible: true },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          curationId: true,
          pageStyleId: true,
          menuStyleId: true,
          parentId: true,
        },
      },
    },
  });
  if (!site) return null;

  const styles = await listPageStyles();
  const pages: SnapshotPage[] = await Promise.all(
    site.pages.map(async (p) => {
      const style = styles.find((s) => s.id === p.pageStyleId) ?? null;
      const isCanvas = style?.type === "CANVAS";
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        curationId: isCanvas ? null : p.curationId,
        style,
        canvas: isCanvas ? await getPageCanvas(siteId, p.id) : [],
        components: style?.type === "BLOCK_BUILD" ? await getPageComponents(siteId, p.id) : [],
        signupForms: style?.type === "BLOCK_BUILD" ? await getPageSignupForms(siteId, p.id) : [],
        menuStyleId: p.menuStyleId ?? site.menuStyleId,
        parentId: p.parentId,
      };
    })
  );

  const menuIds = [...new Set(pages.flatMap((p) => (p.menuStyleId ? [p.menuStyleId] : [])))];
  const menuRows = await db.menuStyle.findMany({
    where: { id: { in: menuIds } },
    select: { id: true, layout: true },
  });
  const menus: Record<string, MenuStyleLayout> = {};
  for (const m of menuRows) menus[m.id] = normalizeMenuStyle(m.layout);

  const curationIds = new Set<string>();
  for (const p of pages) {
    if (p.curationId) curationIds.add(p.curationId);
    for (const c of p.canvas) curationIds.add(c.curationId);
  }

  // One curation at a time, so publishing a large site doesn't flood
  // the database.
  const curations: Record<string, SnapshotCuration> = {};
  for (const id of curationIds) {
    const [detail, sections] = await Promise.all([
      getCuration(id, site.artistId),
      listCurationSections(id, site.artistId),
    ]);
    if (!detail) continue;
    const presentations: Record<string, CurationWorkPresentation> = {};
    for (const w of detail.works) {
      const presentation = await getCurationWorkPresentation(id, site.artistId, w.artworkId);
      if (presentation) presentations[w.artworkId] = presentation;
    }
    curations[id] = { detail, sections, presentations };
  }

  const covers = (await listCurationCovers(site.artistId)).filter((c) => curationIds.has(c.id));

  // The stories the pages' Profile stories show (2026-10-26).
  const storyIds = new Set<string>();
  for (const p of pages) {
    if (p.style?.type !== "BLOCK_BUILD") continue;
    const storyBlocks = new Set(p.style.layout.blocks.filter((b) => b.type === "stories").map((b) => b.id));
    for (const c of p.components) {
      if (storyBlocks.has(c.blockId)) for (const s of readPageStories(c.text)) storyIds.add(s.id);
    }
  }
  const profileStories = storyIds.size
    ? (await listProfileStories(site.artistId)).filter((s) => storyIds.has(s.id))
    : [];

  return {
    version: SNAPSHOT_VERSION,
    siteName: site.name,
    artist: await getSiteArtist(site.artistId),
    pages,
    curations,
    covers,
    menus,
    profileStories,
  };
}

// Publishing — replaces the site's published snapshot and reports back
// when it was published, or what went wrong (2026-10-06), so the publish
// icon can say so. A site with a sign-up form (2026-10-10) also brings
// Cloudflare's robot check up to date for its domain and the preview
// (lib/turnstile.ts); if that fails the site is still published, with a
// warning. Every publish, failed ones included, is kept in the site's
// publish log (2026-10-31 — see SitePublishLog).
export async function publishSite(siteId: string): Promise<PublishResult> {
  await requireSiteAccess(siteId);
  const userId = (await getCurrentUser())?.id ?? null;
  let result: PublishResult;
  try {
    const snapshot = await buildSiteSnapshot(siteId);
    if (!snapshot) {
      result = { error: "Site not found." };
    } else {
      const publishedAt = new Date();
      await db.sitePublication.upsert({
        where: { siteId },
        create: { siteId, data: snapshot as object, publishedAt },
        update: { data: snapshot as object, publishedAt },
      });
      const hasSignupForm = snapshot.pages.some((p) => p.signupForms.length > 0);
      const sync = hasSignupForm ? await syncTurnstileDomains() : null;
      result = {
        publishedAt: publishedAt.toISOString(),
        ...(sync && "error" in sync ? { warning: sync.error } : {}),
      };
    }
  } catch (err) {
    console.error("publishSite failed", siteId, err);
    result = { error: "Publishing failed — please try again." };
  }
  await logPublish(siteId, userId, result);
  return result;
}

// One row in the site's publish log. A log that can't be written never
// changes what the publish itself reports.
async function logPublish(siteId: string, userId: string | null, result: PublishResult) {
  try {
    await db.sitePublishLog.create({
      data:
        "error" in result
          ? { siteId, userId, outcome: "FAILED", message: result.error }
          : result.warning
            ? { siteId, userId, outcome: "PUBLISHED_WITH_WARNING", message: result.warning, createdAt: result.publishedAt }
            : { siteId, userId, outcome: "PUBLISHED", createdAt: result.publishedAt },
    });
  } catch (err) {
    console.error("publish log failed", siteId, err);
  }
}

// When the site was last published, or null if it never has been (or
// was published in an older shape — see SNAPSHOT_VERSION). Reads only
// the date, not the whole snapshot, for the publish icon.
export async function getLastPublishedAt(siteId: string): Promise<Date | null> {
  await requireSiteAccess(siteId);
  const row = await db.sitePublication.findUnique({
    where: { siteId },
    select: { publishedAt: true },
  });
  return row?.publishedAt ?? null;
}
