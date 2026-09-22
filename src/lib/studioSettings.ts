import { db } from "@/lib/db";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { SALE_CURRENCIES } from "@/lib/studioShared";

// The artist's first live website — the one whose currency and id the
// Studio app uses (an artist normally has just one).
export async function getPrimarySite(artistId: string) {
  return db.site.findFirst({
    where: { artistId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, defaultCurrency: true },
  });
}

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
  // Pre-selected when recording a sale: the currency of the artist's
  // first live website (GBP if that isn't one Studio offers).
  defaultCurrency: string;
};

export async function getStudioSettings(artistId: string): Promise<StudioSettings> {
  const [settings, site] = await Promise.all([
    getArtworkSettings(artistId),
    getPrimarySite(artistId),
  ]);

  const siteCurrency = site?.defaultCurrency ?? "";
  const defaultCurrency = (SALE_CURRENCIES as readonly string[]).includes(siteCurrency)
    ? siteCurrency
    : "GBP";

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
