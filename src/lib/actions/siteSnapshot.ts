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
import { listPageStyles } from "@/lib/actions/pageStyles";
import {
  SNAPSHOT_VERSION,
  type SiteSnapshot,
  type SnapshotCuration,
  type SnapshotPage,
} from "@/lib/siteSnapshot";

// Publishing a site (2026-10-06) — see lib/siteSnapshot.ts. The whole
// site at once: its Live Pages in order, each with its Display Style,
// curation or canvas placements, and every curation those show, with
// their works, sections and each work's presentation.

async function buildSiteSnapshot(siteId: string): Promise<SiteSnapshot | null> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      artistId: true,
      pages: {
        where: { visible: true },
        orderBy: { position: "asc" },
        select: { id: true, title: true, slug: true, curationId: true, pageStyleId: true },
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
      };
    })
  );

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

  return { version: SNAPSHOT_VERSION, siteName: site.name, pages, curations, covers };
}

// "Publish to live site" — replaces the site's published snapshot.
export async function publishSite(siteId: string): Promise<void> {
  const snapshot = await buildSiteSnapshot(siteId);
  if (!snapshot) return;
  await db.sitePublication.upsert({
    where: { siteId },
    create: { siteId, data: snapshot as object },
    update: { data: snapshot as object, publishedAt: new Date() },
  });
}

// The site as last published, or null if it never has been (or was
// published in an older shape — see SNAPSHOT_VERSION).
export async function getPublishedSite(
  siteId: string
): Promise<{ snapshot: SiteSnapshot; publishedAt: Date } | null> {
  const row = await db.sitePublication.findUnique({
    where: { siteId },
    select: { data: true, publishedAt: true },
  });
  const snapshot = row?.data as SiteSnapshot | undefined;
  if (!row || snapshot?.version !== SNAPSHOT_VERSION) return null;
  return { snapshot, publishedAt: row.publishedAt };
}
