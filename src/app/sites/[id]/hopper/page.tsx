import { db } from "@/lib/db";
import { listHopperQueue } from "@/lib/actions/hopper";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import HopperView from "@/components/HopperView";

export const dynamic = "force-dynamic";

export default async function HopperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [rows, tagPresets] = await Promise.all([
    listHopperQueue(artistId),
    getMediaTagPresets(artistId),
  ]);
  const queue = rows.map((i) => ({
    id: i.id,
    url: i.url,
    posterUrl: i.posterUrl,
    kind: i.kind,
    caption: i.caption,
    altText: i.altText,
    tags: i.tags,
    createdAt: i.createdAt.toISOString(),
  }));

  return <HopperView siteId={id} artistId={artistId} queue={queue} tagPresets={tagPresets} />;
}
