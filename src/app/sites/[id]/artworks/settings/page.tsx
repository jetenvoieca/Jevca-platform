import { db } from "@/lib/db";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import SettingsListCard from "@/components/SettingsListCard";
import ArtworkTypesCard from "@/components/ArtworkTypesCard";
import LocationsCard from "@/components/LocationsCard";
import MediaTagSettingsCard from "@/components/MediaTagSettingsCard";
import { getMediaTagPresets } from "@/lib/actions/mediaCatalogue";
import { clientWords } from "@/lib/clientKind";

export default async function ArtworkSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;
  const [settings, mediaTags] = await Promise.all([
    getArtworkSettings(artistId),
    getMediaTagPresets(artistId),
  ]);
  const words = clientWords(settings.clientKind);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the options offered across the {words.catalogue} and the Media Catalogue.
        Shared across all of this {words.client.toLowerCase()}&apos;s sites.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ArtworkTypesCard artistId={artistId} siteId={id} types={settings.artworkTypeRecords} />
        {/* Locations moved off SettingsListCard (2026-09-22) — a real
            Location model now (Gallery/Own, see schema.prisma), not a
            plain string list, so it has its own card. */}
        <LocationsCard artistId={artistId} siteId={id} locations={settings.locations} />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="mediumPresets"
          title="Medium Presets"
          description="Full phrases offered in the Medium dropdown — add the wording you use repeatedly, to keep it consistent."
          options={settings.mediumPresets}
          placeholder="e.g. Original work on aluminium: mixed media…"
        />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="sizePresets"
          title="Size Presets"
          description="Sizes offered in the Catalogue's Size dropdown — add the ones you use repeatedly, to avoid typos. Shown here ordered by size, smallest first."
          options={settings.sizePresets}
          placeholder="e.g. 60 x 60 cm"
          sortNumerically
        />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="saleSources"
          title="Sale Sources"
          description="Offered when starting a sale — records who actually initiated it, for your own reference."
          options={settings.saleSources}
          placeholder="e.g. Instagram, Studio visit…"
        />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="paymentMethods"
          title="Payment Methods"
          description={`Offered in the Method dropdown when marking a ${words.location.toLowerCase()} sale as paid.`}
          options={settings.paymentMethods}
          placeholder="e.g. Bank transfer, Cash…"
        />
        {/* Media tags (2026-10-15) — moved here when the Media menu
            joined Artworks; one Settings page for both. */}
        <MediaTagSettingsCard artistId={artistId} siteId={id} tags={mediaTags} />
      </div>
    </div>
  );
}
