import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import BlockRenderer from "@/components/BlockRenderer";
import type { ContentBlock } from "@/lib/blocks";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;

  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page || page.siteId !== id) notFound();

  const blocks = (page.draftBlocks as unknown as ContentBlock[]) || [];

  const artworkIds = blocks
    .filter((b): b is Extract<ContentBlock, { type: "artwork" }> => b.type === "artwork")
    .map((b) => b.artworkId)
    .filter(Boolean);

  const artworks = artworkIds.length
    ? await db.artwork.findMany({
        where: { id: { in: artworkIds } },
        include: { images: { take: 1 } },
      })
    : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Preview — showing Draft content only. Visitors can&apos;t see this until you Publish.
      </div>
      <h1 className="mb-6 text-3xl font-semibold text-neutral-900">{page.title}</h1>
      <BlockRenderer blocks={blocks} artworks={artworks} />
    </main>
  );
}
