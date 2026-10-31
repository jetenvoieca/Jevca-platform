import { readArtworkSettings } from "@/lib/artworkSettingsData";

// Everything from the artist's own Settings that the Studio app offers as
// choices, gathered in one place.
export type StudioSettings = {
  artworkTypes: string[];
  // The names of the artist's Locations — galleries and their own places.
  locations: string[];
  sizePresets: string[];
  // How a sale was paid: bank transfer, cash, ...
  paymentMethods: string[];
};

export async function getStudioSettings(artistId: string): Promise<StudioSettings> {
  const settings = await readArtworkSettings(artistId);
  return {
    artworkTypes: settings.artworkTypes,
    locations: settings.locations.map((l) => l.name),
    sizePresets: settings.sizePresets,
    paymentMethods: settings.paymentMethods,
  };
}
