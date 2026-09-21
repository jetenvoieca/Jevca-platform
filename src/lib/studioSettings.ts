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
    artworkLocations: settings.artworkLocations,
    sizePresets: settings.sizePresets,
    saleSources: settings.saleSources,
    defaultInstalmentCount: settings.defaultInstalmentCount,
    defaultCurrency,
  };
}
