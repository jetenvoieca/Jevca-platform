import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getDraftTimeline } from "@/lib/actions/videoEditor";
import { getRenderStatus } from "@/lib/actions/render";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
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
  const [{ renderId, clips }, renderStatus, tagPresets] = await Promise.all([
    getDraftTimeline(artistId),
    getRenderStatus(artistId),
    getMediaTagPresets(artistId),
  ]);

  if (clips.length === 0 && !renderStatus) {
    redirect(`/sites/${id}/media`);
  }

  return (
    <VideoEditorView
      siteId={id}
      renderId={renderId}
      initialClips={clips}
      renderStatus={renderStatus}
      tagPresets={tagPresets}
    />
  );
}

