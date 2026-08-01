import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PageEditor from "./PageEditor";
import SectionEditor from "@/components/SectionEditor";
import { getArtworksByIds } from "@/lib/actions/artworks";
import type { ContentBlock, SectionContent } from "@/lib/blocks";

export default async function PageEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;

  const [page, site] = await Promise.all([
    db.page.findUnique({ where: { id: pageId } }),
    db.site.findUnique({ where: { id }, select: { artistId: true } }),
  ]);
  if (!page || page.siteId !== id || !site) notFound();

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
      <SectionEditor
        siteId={id}
        artistId={site.artistId}
        pageId={page.id}
        pageTitle={page.title}
        initialByline={content.byline || ""}
        initialArtworks={artworks}
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
    />
  );
}
