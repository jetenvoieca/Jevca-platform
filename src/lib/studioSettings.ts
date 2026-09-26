import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { getArtistDefaultCurrency } from "@/lib/primarySite";

// Everything from the artist's own Settings that the Studio app offers as
// choices, gathered in one place.
export type StudioSettings = {
  artworkTypes: string[];
  artworkLocations: string[];
  sizePresets: string[];
  saleSources: string[];
  // How a sale was paid: bank transfer, cash, ...
  paymentMethods: string[];
  // How many payments an instalment plan is split into.
  defaultInstalmentCount: number;
  // Pre-selected when recording a sale — see getArtistDefaultCurrency.
  defaultCurrency: string;
};

export async function getStudioSettings(artistId: string): Promise<StudioSettings> {
  const [settings, defaultCurrency] = await Promise.all([
    getArtworkSettings(artistId),
    getArtistDefaultCurrency(artistId),
  ]);

  return {
    artworkTypes: settings.artworkTypes,
    // getArtworkSettings returns the new Location model now (2026-09-22
    // — see actions/locations.ts), not a plain string[] — the Studio
    // app's own dropdown here still just needs names. Note this list can
    // differ from what studioArtworks.ts's consignArtwork() actually
    // validates against (still the older Artist.artworkLocations DB
    // column directly, a known follow-up, not yet unified with the new
    // Location model).
    artworkLocations: settings.locations.map((l) => l.name),
    sizePresets: settings.sizePresets,
    saleSources: settings.saleSources,
    paymentMethods: settings.paymentMethods,
    defaultInstalmentCount: settings.defaultInstalmentCount,
    defaultCurrency,
  };
}
