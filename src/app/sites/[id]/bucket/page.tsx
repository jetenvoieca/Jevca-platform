import { db } from "@/lib/db";
import { getDraftTimeline } from "@/lib/actions/videoEditor";
import { getRenderStatus } from "@/lib/actions/render";
import { getMediaTagPresets, getArtistArtworksForLinking } from "@/lib/actions/mediaCatalogue";
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

  const [{ renderId, clips }, renderStatus, tagPresets, artistArtworks] = await Promise.all([
    getDraftTimeline(artistId),
    getRenderStatus(artistId),
    getMediaTagPresets(artistId),
    getArtistArtworksForLinking(artistId),
  ]);

  return (
    <VideoEditorView
      siteId={id}
      renderId={renderId}
      initialClips={clips}
      renderStatus={renderStatus}
      tagPresets={tagPresets}
      artistArtworks={artistArtworks}
    />
  );
}
