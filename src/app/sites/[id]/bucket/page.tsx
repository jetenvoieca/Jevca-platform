import { db } from "@/lib/db";
import { getDraftTimeline } from "@/lib/actions/videoEditor";
import { getRenderStatus } from "@/lib/actions/render";
import VideoEditorView from "@/components/VideoEditorView";

export const dynamic = "force-dynamic";

export default async function BucketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [{ renderId, clips }, renderStatus] = await Promise.all([
    getDraftTimeline(artistId),
    getRenderStatus(artistId),
  ]);

  return (
    <VideoEditorView siteId={id} renderId={renderId} initialClips={clips} renderStatus={renderStatus} />
  );
}
