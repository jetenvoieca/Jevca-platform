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
import type { SignupFormContent } from "@/lib/signupForms";
import type { SiteArtist } from "@/lib/siteArtist";

// A published site (2026-10-06) — everything its pages show, saved when
// "Publish to live site" is pressed (see SitePublication in
// schema.prisma and lib/actions/siteSnapshot.ts). The site's pages are
// drawn only from this, so later edits don't show until the next
// publish. Plain module, not "use server", so pages and components can
// share the shapes.

// Bumped whenever the shape below changes; an older snapshot is treated
// as not published until the site is published again. 2 (2026-10-07):
// the Block Build Style Type is stored as BLOCK_BUILD (was PRIVATE).
// 3 (2026-10-13): curations have three fixed sections, and a page's
// components say where their content comes from (typed Header, edited
// Description, works removed / reordered).
// 4 (2026-10-13): the artist's Logo, for Logo components.
// 5 (2026-10-13): the artist's Logo and footer together (`artist`).
// 6 (2026-10-13): the footer shows the town, not the full address.
export const SNAPSHOT_VERSION = 6;

// Where a published site's home page is (its first Live Page) — the
// menu's first link and a Logo's link (2026-10-13). Private for now, at
// the app's own /site-preview address.
export function publishedHomePath(siteId: string): string {
  return `/site-preview/${siteId}`;
}

// A Live Page's address on the published site: the first is the home
// page, the others are at their slug.
export function publishedPagePath(siteId: string, pages: { slug: string }[], index: number): string {
  const base = publishedHomePath(siteId);
  return index === 0 ? base : `${base}/${encodeURIComponent(pages[index].slug)}`;
}

// The Live Page an address on the published site shows — null if it
// isn't one of the site's pages.
export function pageForPath<P extends { slug: string }>(
  siteId: string,
  pages: P[],
  pathname: string
): P | null {
  const base = publishedHomePath(siteId);
  const path = pathname.replace(/\/+$/, "");
  if (path === base) return pages[0] ?? null;
  if (!path.startsWith(`${base}/`)) return null;
  const slug = decodeURIComponent(path.slice(base.length + 1));
  if (slug.includes("/")) return null;
  return pages.find((p) => p.slug === slug) ?? null;
}

// One live page, in menu order. `curationId` is the page's own curation
// (not used with a Canvas style, whose curations are in `canvas`).
// `menuStyleId` (2026-10-06) is the menu this page shows — its own, or
// else the site's; null = no menu. Its settings are in `menus`.
// `components` (2026-10-07) is what fills a Block Build page's
// components; a site published before it existed reads it as empty.
// `signupForms` (2026-10-10) is the wording of its Sign-up form
// components (never their list — see lib/actions/websiteSignup.ts); read
// as empty for a site published before it existed.
export type SnapshotPage = {
  id: string;
  title: string;
  slug: string;
  curationId: string | null;
  style: PageStyleSummary | null;
  canvas: CanvasPlacement[];
  components: ComponentContent[];
  signupForms: SignupFormContent[];
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
  // The artist's Logo and footer (2026-10-13) — see lib/siteArtist.ts.
  artist: SiteArtist | null;
  // Live Pages, in order — the first is the home page.
  pages: SnapshotPage[];
  curations: Record<string, SnapshotCuration>;
  // Covers of the curations placed on Canvas pages.
  covers: CurationCover[];
  // The menus the pages show (2026-10-06), by Menu Style id.
  menus: Record<string, MenuStyleLayout>;
};

// What "Publish to live site" reports back (2026-10-06): when the site
// was published (ISO date), or what went wrong. `warning` (2026-10-10):
// published, but something on it won't work yet (its sign-up forms'
// robot check — see lib/turnstile.ts).
export type PublishResult = { publishedAt: string; warning?: string } | { error: string };

// The pictures a page shows first (2026-10-13): its works' and Supporting
// Images' pictures, the Video's poster, the Logo, and the curations'
// covers on a Canvas. Fetched while a visitor hovers over a link to the
// page (see PublishedSite), so they're ready when it opens.
export function pageImageUrls(snapshot: SiteSnapshot, page: SnapshotPage): string[] {
  const urls = new Set<string>();
  const add = (url: string | null | undefined) => {
    if (url) urls.add(url);
  };
  const style = page.style;
  if (style?.type === "CANVAS") {
    for (const placement of page.canvas) {
      add(snapshot.covers.find((c) => c.id === placement.curationId)?.imageUrl);
    }
    return [...urls];
  }
  const blocks = style?.type === "BLOCK_BUILD" ? style.layout.blocks : [];
  if (blocks.some((b) => b.type === "logo")) add(snapshot.artist?.logoUrl);
  const curation = page.curationId ? snapshot.curations[page.curationId] : undefined;
  if (!curation) return [...urls];
  const doors = blocks.some((b) => b.type === "slidingdoors");
  for (const work of curation.detail.works) {
    add(work.imageUrl);
    if (doors) add(work.displayUrl);
  }
  for (const section of curation.sections) {
    for (const media of section.media) add(media.kind === "PHOTO" ? media.url : media.posterUrl);
  }
  return [...urls];
}
