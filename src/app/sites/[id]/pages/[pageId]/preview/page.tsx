import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import BlockRenderer from "@/components/BlockRenderer";
import SectionGrid from "@/components/SectionGrid";
import PortfolioGrid from "@/components/PortfolioGrid";
import { getArtworksByIds } from "@/lib/actions/artworks";
import type { ContentBlock, SectionContent, PortfolioContent } from "@/lib/blocks";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;

  const [page, site] = await Promise.all([
    db.page.findUnique({
      where: { id: pageId },
      include: { backgroundImage: true },
    }),
    // Only needed for the Portfolio branch below (artist name heading,
    // matching the isendyouthis.com reference sites) but cheap enough to
    // fetch alongside every page type rather than branching the query.
    db.site.findUnique({ where: { id }, select: { artist: { select: { name: true } } } }),
  ]);
  if (!page || page.siteId !== id) notFound();

  const banner = (
    <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
      Preview — showing Draft content only. Visitors can&apos;t see this until you Publish.
    </div>
  );

  if (page.type === "SECTION") {
    const content = (page.draftBlocks as unknown as SectionContent) || {
      byline: "",
      artworkIds: [],
    };
    const artworkRows = await getArtworksByIds(content.artworkIds || []);
    const artworks = artworkRows.map((a) => ({
      id: a.id,
      presentationTitle: a.presentationTitle,
      imageUrl: a.images[0]?.url ?? null,
      presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    }));

    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        {banner}
        <SectionGrid title={page.title} byline={content.byline || ""} artworks={artworks} />
      </main>
    );
  }

  // Portfolio is the first PageStyle with a real renderer (2026-09-06) —
  // uses the exact same PortfolioGrid component as the editor's own live
  // preview column, so there's one render path for what a Portfolio page
  // looks like, not two that can drift apart. Every other, not-yet-built
  // style falls through to a plain placeholder rather than the generic
  // block renderer below, which expects a ContentBlock[] shape this page
  // type never has.
  if (page.type === "TEMPLATE_STYLE" && page.templateStyle === "PORTFOLIO") {
    // Page.draftBlocks defaults to "[]" (an empty JSON array) at the
    // database level, not "{ groups: [] }" — and [] is truthy in JS, so
    // "page.draftBlocks || { groups: [] }" never actually falls back to
    // the default here. Guarded explicitly instead of relying on that
    // fallback (bug fixed 2026-09-07 — same crash as the editor route).
    const rawContent = page.draftBlocks as unknown as PortfolioContent;
    const contentGroups = Array.isArray(rawContent?.groups) ? rawContent.groups : [];
    const [groupArtworkRows, siteOwnPages] = await Promise.all([
      Promise.all(contentGroups.map((g) => getArtworksByIds(g.artworkIds || []))),
      // The site's real navigation (2026-09-07, feedback round 5) — a
      // fixed-format template like this one builds its nav straight
      // from the site's own real pages, matching
      // jillysuttonsculpture.com (each of "portfolio", "showcase",
      // "profile" etc. is literally a distinct page there) — Menu
      // Builder is for freeform templates instead, which don't have a
      // fixed page structure to draw the nav from. See PortfolioSitePage
      // in PortfolioGrid.tsx.
      db.page.findMany({
        where: {
          siteId: id,
          visible: true,
          OR: [{ sourceTag: null }, { sourceTag: { not: "pavilion" } }],
        },
        orderBy: { position: "asc" },
        select: { id: true, title: true },
      }),
    ]);
    const groups = contentGroups.map((g, i) => ({
      id: g.id,
      name: g.name,
      artworks: groupArtworkRows[i].map((a) => ({
        id: a.id,
        presentationTitle: a.presentationTitle,
        imageUrl: a.images[0]?.url ?? null,
        presentationPrice: a.presentationPrice,
        description: a.description,
        presentationMedium: a.presentationMedium,
        viewingLocation: a.viewingLocation,
        size: a.size,
        edition: a.edition,
      })),
    }));

    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* No draft banner here (2026-09-07, feedback round 4) — this
            page style is judged against a real reference site's visual
            fidelity, and the banner broke that comparison. Still shown
            for the generic block-based pages further below, where it
            still serves a real purpose. */}
        <PortfolioGrid
          artistName={site?.artist.name ?? ""}
          title={page.title}
          groups={groups}
          sitePages={siteOwnPages}
          currentPageId={page.id}
        />
      </main>
    );
  }

  if (page.type === "TEMPLATE_STYLE") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        {banner}
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          {page.templateStyle?.toLowerCase()} layout
        </p>
        <h1 className="mt-2 text-xl font-semibold text-neutral-900">{page.title}</h1>
        <p className="mt-4 text-sm text-neutral-500">
          This page style hasn&apos;t been built yet.
        </p>
      </main>
    );
  }

  const blocks = (page.draftBlocks as unknown as ContentBlock[]) || [];

  const artworkIds = blocks
    .filter((b): b is Extract<ContentBlock, { type: "artwork" }> => b.type === "artwork")
    .map((b) => b.artworkId)
    .filter(Boolean);

  const artworks = artworkIds.length
    ? await db.artwork.findMany({
        where: { id: { in: artworkIds } },
        include: { images: { take: 1 }, mainImage: true },
        relationLoadStrategy: "query",
      })
    : [];
  // Folds mainImage into the same images[0] slot BlockRenderer already
  // reads (2026-08-16, same pattern as listArtworks).
  const artworksWithMainImage = artworks.map(({ mainImage, images, ...a }) => ({
    ...a,
    images: mainImage ? [mainImage, ...images.filter((i) => i.id !== mainImage.id)] : images,
  }));

  return (
    <main
      className="mx-auto max-w-3xl px-6 py-10"
      style={{
        backgroundColor: page.backgroundColor || undefined,
        backgroundImage: page.backgroundImage?.url ? `url(${page.backgroundImage.url})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {banner}
      {/* No automatic page-title heading (2026-09-03) — a page only
          shows a heading now if a Header block has deliberately been
          added to it; see the Header block note in lib/blocks.ts. */}
      <BlockRenderer blocks={blocks} artworks={artworksWithMainImage} />
    </main>
  );
}
