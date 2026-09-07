import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PageEditor from "./PageEditor";
import SectionEditor from "@/components/SectionEditor";
import PavilionEditor from "@/components/PavilionEditor";
import PavilionVisualEditor from "@/components/PavilionVisualEditor";
import PortfolioEditor from "@/components/PortfolioEditor";
import { getArtworksByIds } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import type { ContentBlock, SectionContent, PavilionContent, PortfolioContent } from "@/lib/blocks";

export default async function PageEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;

  const [page, site] = await Promise.all([
    db.page.findUnique({
      where: { id: pageId },
      // backgroundImage included so its url is available to prefill the
      // editor without a second query — see Page.backgroundImageId in
      // schema.prisma.
      include: { backgroundImage: true },
    }),
    db.site.findUnique({ where: { id }, select: { artistId: true, defaultCurrency: true } }),
  ]);
  if (!page || page.siteId !== id || !site) notFound();

  if (page.type === "SECTION") {
    const content = (page.draftBlocks as unknown as SectionContent) || {
      byline: "",
      artworkIds: [],
    };
    const [artworkRows, settings] = await Promise.all([
      getArtworksByIds(content.artworkIds || []),
      getArtworkSettings(site.artistId),
    ]);
    const artworks = artworkRows.map((a) => ({
      id: a.id,
      presentationTitle: a.presentationTitle,
      imageUrl: a.images[0]?.url ?? null,
      presentationPrice: a.presentationPrice,
    }));

    return (
      <SectionEditor
        siteId={id}
        artistId={site.artistId}
        pageId={page.id}
        pageTitle={page.title}
        initialByline={content.byline || ""}
        initialArtworks={artworks}
        settings={settings}
        siteDefaultCurrency={site.defaultCurrency}
      />
    );
  }

  if (page.type === "PAVILION") {
    const content = (page.draftBlocks as unknown as PavilionContent) || { cards: [] };

    return (
      <PavilionEditor
        siteId={id}
        artistId={site.artistId}
        pageId={page.id}
        pageTitle={page.title}
        initialCards={content.cards || []}
      />
    );
  }

  if (page.type === "PAVILION_VISUAL") {
    const content = (page.draftBlocks as unknown as PavilionContent) || { cards: [] };

    return (
      <PavilionVisualEditor
        siteId={id}
        artistId={site.artistId}
        pageId={page.id}
        pageTitle={page.title}
        initialCards={content.cards || []}
      />
    );
  }

  // A page created from one of the site's Template's page styles
  // (2026-09-06 — see Page.templateStyle in schema.prisma). Portfolio is
  // the first style with a real renderer; every other style still shows
  // the plain placeholder below until it's built, one at a time, rather
  // than silently falling through to the generic block editor, which
  // would be the wrong editor entirely for a page meant to use a fixed
  // layout.
  if (page.type === "TEMPLATE_STYLE" && page.templateStyle === "PORTFOLIO") {
    // Page.draftBlocks defaults to "[]" (an empty JSON array) at the
    // database level, not "{ groups: [] }" — and [] is truthy in JS, so
    // "page.draftBlocks || { groups: [] }" never actually falls back to
    // the default here. Guarded explicitly instead of relying on that
    // fallback (bug fixed 2026-09-07 — this crashed the whole page with
    // a server error the moment a brand-new Portfolio page was opened).
    const rawContent = page.draftBlocks as unknown as PortfolioContent;
    const contentGroups = Array.isArray(rawContent?.groups) ? rawContent.groups : [];
    const [settings, ...groupArtworkRows] = await Promise.all([
      getArtworkSettings(site.artistId),
      ...contentGroups.map((g) => getArtworksByIds(g.artworkIds || [])),
    ]);
    const initialGroups = contentGroups.map((g, i) => ({
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
      <PortfolioEditor
        siteId={id}
        artistId={site.artistId}
        pageId={page.id}
        pageTitle={page.title}
        initialGroups={initialGroups}
        settings={settings}
        siteDefaultCurrency={site.defaultCurrency}
      />
    );
  }

  if (page.type === "TEMPLATE_STYLE") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          {page.templateStyle?.toLowerCase()} layout
        </p>
        <h1 className="mt-2 text-xl font-semibold text-neutral-900">{page.title}</h1>
        <p className="mt-4 text-sm text-neutral-500">
          This page style hasn&apos;t been built yet — it&apos;s coming next, one style at a time.
        </p>
      </div>
    );
  }

  const blocks = (page.draftBlocks as unknown as ContentBlock[]) || [];

  return (
    <PageEditor
      siteId={id}
      artistId={site.artistId}
      pageId={page.id}
      pageTitle={page.title}
      initialBlocks={blocks}
      initialBackgroundColor={page.backgroundColor}
      initialBackgroundImageId={page.backgroundImageId}
      initialBackgroundImageUrl={page.backgroundImage?.url ?? null}
    />
  );
}
