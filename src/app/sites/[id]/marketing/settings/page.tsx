import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import MediaTagSettingsCard from "@/components/MediaTagSettingsCard";
import { clientWordsForArtist } from "@/lib/clientWordsForArtist";

// Marketing's Settings (2026-10-15) — the Media Catalogue's tags, now
// that the Media Catalogue sits in Marketing.
export default async function MarketingSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();
  const [tags, words] = await Promise.all([
    getMediaTagPresets(site.artistId),
    clientWordsForArtist(site.artistId),
  ]);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the tags offered across the Media Catalogue. Shared across all of this{" "}
        {words.client.toLowerCase()}&apos;s sites.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MediaTagSettingsCard artistId={site.artistId} siteId={id} tags={tags} />
      </div>
    </div>
  );
}
