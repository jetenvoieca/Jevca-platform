import { db } from "@/lib/db";
import { listArtworks, listArtworkNames, getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { listCurations } from "@/lib/actions/curations";
import ArtworksCatalogueView from "./ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  // One exact artwork name — the Name dropdown (2026-10-13).
  name?: string;
  availability?: string;
  location?: string;
  type?: string;
  // The order (2026-10-26) — see ArtworkFilterInput in lib/artworkFilters.ts.
  sort?: string;
  // Curation filter (2026-09-24) — a Curation's id. See
  // ArtworkFilterInput in lib/artworkFilters.ts.
  curation?: string;
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
    select: { artistId: true, artist: { select: { name: true } } },
  });
  const artistId = site!.artistId;

  const [{ rows, total, soldCount }, settings, names, curations, selectedRaw] = await Promise.all([
    listArtworks(artistId, {
      name: sp.name,
      availability: sp.availability,
      location: sp.location,
      type: sp.type,
      curation: sp.curation,
      sort: sp.sort,
      limit: PAGE_SIZE,
    }),
    getArtworkSettings(artistId),
    listArtworkNames(artistId),
    listCurations(artistId),
    sp.selected ? getArtworkDetailForClient(sp.selected) : Promise.resolve(null),
  ]);

  const selected = selectedRaw && selectedRaw.artistId === artistId ? selectedRaw : null;

  return (
    <ArtworksCatalogueView
      siteId={id}
      artistId={artistId}
      artistName={site!.artist.name}
      artworks={rows}
      total={total}
      soldCount={soldCount}
      pageSize={PAGE_SIZE}
      name={sp.name || ""}
      names={names}
      availability={sp.availability || ""}
      location={sp.location || ""}
      type={sp.type || ""}
      sort={sp.sort || ""}
      curation={sp.curation || ""}
      curations={curations}
      initialSelected={selected}
      settings={settings}
    />
  );
}
