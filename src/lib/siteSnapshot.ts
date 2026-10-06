import type {
  CurationCover,
  CurationDetail,
  CurationWorkPresentation,
} from "@/lib/actions/curations";
import type { CanvasPlacement } from "@/lib/actions/pageCanvas";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { CurationSectionData } from "@/lib/curationSections";

// A published site (2026-10-06) — everything its pages show, saved when
// "Publish to live site" is pressed (see SitePublication in
// schema.prisma and lib/actions/siteSnapshot.ts). The site's pages are
// drawn only from this, so later edits don't show until the next
// publish. Plain module, not "use server", so pages and components can
// share the shapes.

// Bumped whenever the shape below changes; an older snapshot is treated
// as not published until the site is published again.
export const SNAPSHOT_VERSION = 1;

// One live page, in menu order. `curationId` is the page's own curation
// (not used with a Canvas style, whose curations are in `canvas`).
export type SnapshotPage = {
  id: string;
  title: string;
  slug: string;
  curationId: string | null;
  style: PageStyleSummary | null;
  canvas: CanvasPlacement[];
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
};

// What "Publish to live site" reports back (2026-10-06): when the site
// was published (ISO date), or what went wrong.
export type PublishResult = { publishedAt: string } | { error: string };
