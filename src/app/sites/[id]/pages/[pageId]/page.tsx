import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PageEditor from "./PageEditor";
import type { ContentBlock } from "@/lib/blocks";

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
