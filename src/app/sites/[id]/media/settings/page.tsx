import { db } from "@/lib/db";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import MediaTagSettingsCard from "@/components/MediaTagSettingsCard";

export default async function MediaSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;
  const tags = await getMediaTagPresets(artistId);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the tags offered across the Media Catalogue. Shared across all of this artist's
        sites.
      </p>

      <MediaTagSettingsCard artistId={artistId} siteId={id} tags={tags} />
    </div>
  );
}
