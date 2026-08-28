import { db } from "@/lib/db";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import SettingsListCard from "@/components/SettingsListCard";
import ArtworkTypesCard from "@/components/ArtworkTypesCard";
import PaymentDefaultsCard from "@/components/PaymentDefaultsCard";

export default async function ArtworkSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;
  const settings = await getArtworkSettings(artistId);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the Group, Type, Location, Medium and Size options offered across the Artwork
        Catalogue. Shared across all of this artist&apos;s sites.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="artworkGroups"
          title="Groups"
          description="Offered in the Group dropdown, on both Presentation and Catalogue."
          options={settings.artworkGroups}
          placeholder="New group…"
        />
        <ArtworkTypesCard artistId={artistId} siteId={id} types={settings.artworkTypeRecords} />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="artworkLocations"
          title="Locations"
          description="Offered in the Location dropdown — sorts the Catalogue by where a piece physically is."
          options={settings.artworkLocations}
          placeholder="New location…"
        />
        <SettingsListCard
          artistId={artistId}
          siteId={id}
          field="mediumPresets"
          title="Medium Presets"
          description="Full phrases offered in the Medium dropdown — add the wording you use repeatedly, to keep it consistent."
          options={settings.mediumPresets}
          placeholder="e.g. Original work on aluminium: mixed media…"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentDefaultsCard
          artistId={artistId}
          siteId={id}
          defaultInstalmentCount={settings.defaultInstalmentCount}
          defaultReleaseMessage={settings.defaultReleaseMessage}
          defaultReleaseTriggerCount={settings.defaultReleaseTriggerCount}
        />
      </div>
    </div>
  );
}
