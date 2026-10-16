import { db } from "@/lib/db";
import { getDraftTimeline } from "@/lib/actions/videoEditor";
import { getRenderStatus } from "@/lib/actions/render";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import { listMusic } from "@/lib/actions/music";
import { listStickers } from "@/lib/actions/stickers";
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

  // artistArtworks dropped from here 2026-08-19 — was only ever fetched
  // to feed MediaDetailPanel's "Related Artwork" dropdown, which was
  // removed (see MediaDetailPanel.tsx and updateMedia's own note for the
  // full reasoning). Nothing else on this page ever used it.
  const [{ renderId, clips, shape, music, muteClips }, renderStatus, tagPresets, musicTracks, stickerLibrary] =
    await Promise.all([
      getDraftTimeline(artistId),
      getRenderStatus(artistId),
      getMediaTagPresets(artistId),
      listMusic(artistId),
      listStickers(artistId),
    ]);

  return (
    <VideoEditorView
      siteId={id}
      artistId={artistId}
      renderId={renderId}
      initialClips={clips}
      initialShape={shape}
      initialMusic={music}
      initialMuteClips={muteClips}
      musicTracks={musicTracks}
      stickerLibrary={stickerLibrary}
      renderStatus={renderStatus}
      tagPresets={tagPresets}
    />
  );
}

