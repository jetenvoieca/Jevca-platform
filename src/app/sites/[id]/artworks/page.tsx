import { db } from "@/lib/db";
import { listArtworks, getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import ArtworksCatalogueView from "./ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
  // Deep-link to a specific artwork's detail panel (e.g. right after
  // creating one, or a link from elsewhere) — read once on first load.
  // Selecting a *different* artwork afterwards happens client-side,
  // without a full navigation — see ArtworksCatalogueView for why
  // (2026-08-11 perf/flicker fix, same pattern as Media Catalogue's).
  selected?: string;
};

const PAGE_SIZE = 60;

export default async function ArtworksCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, defaultCurrency: true },
  });
  const artistId = site!.artistId;

  const [{ rows: artworks, total, soldCount }, settings, selectedRaw] = await Promise.all([
    listArtworks(artistId, { ...sp, limit: PAGE_SIZE }),
    getArtworkSettings(artistId),
    sp.selected ? getArtworkDetailForClient(sp.selected) : Promise.resolve(null),
  ]);

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    type: a.type,
    imageUrl: a.images[0]?.url ?? null,
  }));

  const selected = selectedRaw && selectedRaw.artistId === artistId ? selectedRaw : null;

  return (
    <ArtworksCatalogueView
      siteId={id}
      artistId={artistId}
      artworks={rows}
      total={total}
      soldCount={soldCount}
      pageSize={PAGE_SIZE}
      q={sp.q || ""}
      availability={sp.availability || ""}
      location={sp.location || ""}
      type={sp.type || ""}
      group={sp.group || ""}
      sort={sp.sort || ""}
      initialSelected={selected}
      settings={settings}
      siteDefaultCurrency={site!.defaultCurrency}
    />
  );
}
