import { db } from "@/lib/db";
import { listArtworks, listArtworkNames, getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { listCurations } from "@/lib/actions/curations";
import { getCurrentUser } from "@/lib/currentUser";
import ArtworksCatalogueView from "@/app/sites/[id]/artworks/ArtworksCatalogueView";

// The Artwork Catalogue's data and view, shared by the admin's page
// (/sites/[id]/artworks) and the Artist App's Catalogue (2026-11-10, with
// Art Manager) — `basePath` keeps its "Add" link inside whichever it's in.
// Callers check access.

export type CatalogueSearchParams = {
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
  // Base works only (2026-11-01) — see ArtworkFilterInput.
  base?: string;
  // Deep-link to a specific artwork's detail panel (e.g. right after
  // creating one, or a link from elsewhere) — read once on first load.
  // Selecting a *different* artwork afterwards happens client-side,
  // without a full navigation — see ArtworksCatalogueView for why
  // (2026-08-11 perf/flicker fix, same pattern as Media Catalogue's).
  selected?: string;
};

const PAGE_SIZE = 60;

export default async function ArtworkCatalogueScreen({
  siteId: id,
  sp,
  basePath,
}: {
  siteId: string;
  sp: CatalogueSearchParams;
  basePath?: string;
}) {
  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true, artist: { select: { name: true } } },
  });
  const artistId = site!.artistId;

  const [{ rows, total, soldCount }, settings, names, curations, selectedRaw, user] = await Promise.all([
    listArtworks(artistId, {
      name: sp.name,
      availability: sp.availability,
      location: sp.location,
      type: sp.type,
      curation: sp.curation,
      base: sp.base,
      sort: sp.sort,
      limit: PAGE_SIZE,
    }),
    getArtworkSettings(artistId),
    listArtworkNames(artistId),
    listCurations(artistId),
    sp.selected ? getArtworkDetailForClient(sp.selected) : Promise.resolve(null),
    getCurrentUser(),
  ]);

  const selected = selectedRaw && selectedRaw.artistId === artistId ? selectedRaw : null;

  return (
    <ArtworksCatalogueView
      siteId={id}
      basePath={basePath}
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
      base={sp.base || ""}
      curations={curations}
      initialSelected={selected}
      settings={settings}
      isAdmin={user?.role === "ADMIN"}
    />
  );
}
