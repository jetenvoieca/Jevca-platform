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

  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page || page.siteId !== id) notFound();

  const blocks = (page.draftBlocks as unknown as ContentBlock[]) || [];

  return (
    <PageEditor siteId={id} pageId={page.id} pageTitle={page.title} initialBlocks={blocks} />
  );
}
