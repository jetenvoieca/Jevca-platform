import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import MediaTagSettingsCard from "@/components/MediaTagSettingsCard";
import InstagramSettingsCard from "@/components/InstagramSettingsCard";
import { getInstagramAccount } from "@/lib/instagram";
import { clientWordsForArtist } from "@/lib/clientWordsForArtist";

// Marketing's Settings (2026-10-15) — the Media Catalogue's tags, now
// that the Media Catalogue sits in Marketing, and the artist's Instagram
// (Connect Instagram comes back here, with ?instagramError= if it failed).
export const dynamic = "force-dynamic";

export default async function MarketingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ instagramError?: string }>;
}) {
  const { id } = await params;
  const { instagramError } = await searchParams;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();
  const [tags, words, instagram] = await Promise.all([
    getMediaTagPresets(site.artistId),
    clientWordsForArtist(site.artistId),
    getInstagramAccount(site.artistId),
  ]);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Shared across all of this {words.client.toLowerCase()}&apos;s sites.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MediaTagSettingsCard artistId={site.artistId} siteId={id} tags={tags} />
        <InstagramSettingsCard
          artistId={site.artistId}
          siteId={id}
          account={instagram}
          error={instagramError || null}
        />
      </div>
    </div>
  );
}
