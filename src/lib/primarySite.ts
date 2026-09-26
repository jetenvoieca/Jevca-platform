import { db } from "@/lib/db";
import { isCurrency, type Currency } from "@/lib/currencies";

// The artist's first website that isn't archived — the one whose id and
// currency are used wherever one site has to stand for the artist (an
// artist normally has just one).
export async function getPrimarySite(artistId: string) {
  return db.site.findFirst({
    where: { artistId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, defaultCurrency: true },
  });
}

// The currency a new artwork is priced in and a new Studio sale starts
// in: the primary website's currency, or GBP if it has none we support.
export async function getArtistDefaultCurrency(artistId: string): Promise<Currency> {
  const site = await getPrimarySite(artistId);
  const currency = site?.defaultCurrency ?? "";
  return isCurrency(currency) ? currency : "GBP";
}
