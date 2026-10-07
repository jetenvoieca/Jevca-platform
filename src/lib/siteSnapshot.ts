import type {
  CurationCover,
  CurationDetail,
  CurationWorkPresentation,
} from "@/lib/actions/curations";
import type { CanvasPlacement } from "@/lib/actions/pageCanvas";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { MenuStyleLayout } from "@/lib/menuStyleLayout";
import type { CurationSectionData } from "@/lib/curationSections";
import type { ComponentContent } from "@/lib/pageComponents";

// A published site (2026-10-06) — everything its pages show, saved when
// "Publish to live site" is pressed (see SitePublication in
// schema.prisma and lib/actions/siteSnapshot.ts). The site's pages are
// drawn only from this, so later edits don't show until the next
// publish. Plain module, not "use server", so pages and components can
// share the shapes.

// Bumped whenever the shape below changes; an older snapshot is treated
// as not published until the site is published again. 2 (2026-10-07):
// the Block Build Style Type is stored as BLOCK_BUILD (was PRIVATE).
export const SNAPSHOT_VERSION = 2;

// One live page, in menu order. `curationId` is the page's own curation
// (not used with a Canvas style, whose curations are in `canvas`).
// `menuStyleId` (2026-10-06) is the menu this page shows — its own, or
// else the site's; null = no menu. Its settings are in `menus`.
// `components` (2026-10-07) is what fills a Block Build page's
// components; a site published before it existed reads it as empty.
export type SnapshotPage = {
  id: string;
  title: string;
  slug: string;
  curationId: string | null;
  style: PageStyleSummary | null;
  canvas: CanvasPlacement[];
  components: ComponentContent[];
  menuStyleId: string | null;
};

// One curation shown somewhere on the site: its works, its sections, and
// each work's presentation (the details panel), by artwork id.
export type SnapshotCuration = {
  detail: CurationDetail;
  sections: CurationSectionData[];
  presentations: Record<string, CurationWorkPresentation>;
};

export type SiteSnapshot = {
  version: number;
  siteName: string;
  // Live Pages, in order — the first is the home page.
  pages: SnapshotPage[];
  curations: Record<string, SnapshotCuration>;
  // Covers of the curations placed on Canvas pages.
  covers: CurationCover[];
  // The menus the pages show (2026-10-06), by Menu Style id.
  menus: Record<string, MenuStyleLayout>;
};

// What "Publish to live site" reports back (2026-10-06): when the site
// was published (ISO date), or what went wrong.
export type PublishResult = { publishedAt: string } | { error: string };
