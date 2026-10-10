"use server";

import { db } from "@/lib/db";
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
import { normalizeLayout } from "@/lib/pageStyleLayout";
import { isPageStyleType } from "@/lib/pageStyleTypes";
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

  return { version: SNAPSHOT_VERSION, siteName: site.name, pages, curations, covers, menus };
}

// "Publish to live site" — replaces the site's published snapshot and
// reports back when it was published, or what went wrong (2026-10-06),
// so the button can say so. A site with a sign-up form (2026-10-10)
// also brings Cloudflare's robot check up to date for its domain and the
// preview (lib/turnstile.ts); if that fails the site is still published,
// with a warning.
export async function publishSite(siteId: string): Promise<PublishResult> {
  try {
    const snapshot = await buildSiteSnapshot(siteId);
    if (!snapshot) return { error: "Site not found." };
    const publishedAt = new Date();
    await db.sitePublication.upsert({
      where: { siteId },
      create: { siteId, data: snapshot as object, publishedAt },
      update: { data: snapshot as object, publishedAt },
    });
    const hasSignupForm = snapshot.pages.some((p) => p.signupForms.length > 0);
    const sync = hasSignupForm ? await syncTurnstileDomains() : null;
    return {
      publishedAt: publishedAt.toISOString(),
      ...(sync && "error" in sync ? { warning: sync.error } : {}),
    };
  } catch (err) {
    console.error("publishSite failed", siteId, err);
    return { error: "Publishing failed — please try again." };
  }
}

// When the site was last published, or null if it never has been (or
// was published in an older shape — see SNAPSHOT_VERSION). Reads only
// the date, not the whole snapshot, for the admin's Publish button.
export async function getLastPublishedAt(siteId: string): Promise<Date | null> {
  const row = await db.sitePublication.findUnique({
    where: { siteId },
    select: { publishedAt: true },
  });
  return row?.publishedAt ?? null;
}

// The site as last published, or null if it never has been (or was
// published in an older shape — see SNAPSHOT_VERSION). Each page's
// Display Style is cleaned with the same rules as a saved style
// (2026-10-06), so a style setting added after publishing takes its
// default rather than breaking the page, and one of a type that no
// longer exists (Section, removed 2026-10-07) is dropped; menus
// (2026-10-06) the same. A site published before menus existed shows
// none until it's published again, and one published before
// components' content existed (2026-10-07) shows its Block Build pages
// empty until then; the same for sign-up forms (2026-10-10).
// Changes to a style's own settings still need a publish to show.
export async function getPublishedSite(
  siteId: string
): Promise<{ snapshot: SiteSnapshot; publishedAt: Date } | null> {
  const row = await db.sitePublication.findUnique({
    where: { siteId },
    select: { data: true, publishedAt: true },
  });
  const snapshot = row?.data as SiteSnapshot | undefined;
  if (!row || !snapshot || snapshot.version !== SNAPSHOT_VERSION) return null;
  const pages = snapshot.pages.map((p) => ({
    ...p,
    style:
      p.style && isPageStyleType(p.style.type)
        ? { id: p.style.id, name: p.style.name, ...normalizeLayout(p.style.type, p.style.layout) }
        : null,
    components: p.components ?? [],
    signupForms: p.signupForms ?? [],
    menuStyleId: p.menuStyleId ?? null,
  }));
  const menus: Record<string, MenuStyleLayout> = {};
  for (const [id, layout] of Object.entries(snapshot.menus ?? {})) {
    menus[id] = normalizeMenuStyle(layout);
  }
  return { snapshot: { ...snapshot, pages, menus }, publishedAt: row.publishedAt };
}
