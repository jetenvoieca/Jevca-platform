import { getArtworkSettings } from "@/lib/actions/artworkSettings";

// Everything from the artist's own Settings that the Studio app offers as
// choices, gathered in one place.
export type StudioSettings = {
  artworkTypes: string[];
  // The names of the artist's Locations — galleries and their own places.
  locations: string[];
  sizePresets: string[];
  saleSources: string[];
  // How a sale was paid: bank transfer, cash, ...
  paymentMethods: string[];
  // How many payments an instalment plan is split into.
  defaultInstalmentCount: number;
};

export async function getStudioSettings(artistId: string): Promise<StudioSettings> {
  const settings = await getArtworkSettings(artistId);
  return {
    artworkTypes: settings.artworkTypes,
    locations: settings.locations.map((l) => l.name),
    sizePresets: settings.sizePresets,
    saleSources: settings.saleSources,
    paymentMethods: settings.paymentMethods,
    defaultInstalmentCount: settings.defaultInstalmentCount,
  };
}
