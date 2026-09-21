import { db } from "@/lib/db";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { SALE_CURRENCIES } from "@/lib/studioShared";

// Everything from the artist's own Settings that the Studio app offers as
// choices, gathered in one place.
export type StudioSettings = {
  artworkTypes: string[];
  artworkLocations: string[];
  sizePresets: string[];
  saleSources: string[];
  // Pre-selected when recording a sale: the currency of the artist's
  // first live website (GBP if that isn't one Studio offers).
  defaultCurrency: string;
};

export async function getStudioSettings(artistId: string): Promise<StudioSettings> {
  const [settings, site] = await Promise.all([
    getArtworkSettings(artistId),
    db.site.findFirst({
      where: { artistId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      select: { defaultCurrency: true },
    }),
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
    defaultCurrency,
  };
}
