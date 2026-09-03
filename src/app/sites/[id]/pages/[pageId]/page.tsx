import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PageEditor from "./PageEditor";
import SectionEditor from "@/components/SectionEditor";
import PavilionEditor from "@/components/PavilionEditor";
import PavilionVisualEditor from "@/components/PavilionVisualEditor";
import { getArtworksByIds } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import type { ContentBlock, SectionContent, PavilionContent } from "@/lib/blocks";

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
