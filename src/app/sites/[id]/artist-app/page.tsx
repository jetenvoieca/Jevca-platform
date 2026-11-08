import { db } from "@/lib/db";
import { listArtworks } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import ArtistAppView from "@/components/ArtistAppView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

// The Artist App (2026-11-08, Craig's mockup) — for now the artist's
// works, filtered by All / Base works and Type (the address's `base` and
// `type`, the Catalogue's meanings — see ArtworkFilterInput).
export default async function ArtistAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ base?: string; type?: string }>;
}) {
  const { id } = await params;
  const { base = "", type = "" } = await searchParams;

  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [{ rows, total }, settings] = await Promise.all([
    listArtworks(artistId, { base, type, limit: PAGE_SIZE }),
    getArtworkSettings(artistId),
  ]);

  return (
    <ArtistAppView
      // A new filter starts the grid afresh.
      key={`${base}|${type}`}
      siteId={id}
      artistId={artistId}
      artworks={rows}
      total={total}
      pageSize={PAGE_SIZE}
      base={base}
      type={type}
      types={settings.artworkTypes}
    />
  );
}
