import { db } from "@/lib/db";
import { getDraftTimeline } from "@/lib/actions/videoEditor";
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

  const { renderId, clips } = await getDraftTimeline(artistId);

  return <VideoEditorView siteId={id} renderId={renderId} initialClips={clips} />;
}
