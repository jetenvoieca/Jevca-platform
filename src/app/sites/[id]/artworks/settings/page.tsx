import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import SettingsListCard from "@/components/SettingsListCard";

export default async function ArtworkSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const settings = await getArtworkSettings(id);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the Group, Type, Location, Medium and Size options offered across the Artwork
        Catalogue.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SettingsListCard
          siteId={id}
          field="artworkGroups"
          title="Groups"
          description="Offered in the Group dropdown, on both Presentation and Catalogue."
          options={settings.artworkGroups}
          placeholder="New group…"
        />
        <SettingsListCard
          siteId={id}
          field="artworkTypes"
          title="Types"
          description="Offered in the Type dropdown on every Catalogue entry."
          options={settings.artworkTypes}
          placeholder="New type…"
        />
        <SettingsListCard
          siteId={id}
          field="artworkLocations"
          title="Locations"
          description="Offered in the Location dropdown — sorts the Catalogue by where a piece physically is."
          options={settings.artworkLocations}
          placeholder="New location…"
        />
        <SettingsListCard
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
          siteId={id}
          field="sizePresets"
          title="Size Presets"
          description="Sizes offered in the Catalogue's Size dropdown — add the ones you use repeatedly, to avoid typos."
          options={settings.sizePresets}
          placeholder="e.g. 60 x 60 cm"
        />
      </div>
    </div>
  );
}
