import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ARTIST_APP_SHOWS_MANAGE_WORKS, artistAppHref } from "@/lib/artistApp";
import { listArtworks } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import ArtistWorksView from "@/components/artist-app/ArtistWorksView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

// Manage Works (2026-11-08, Craig's mockup) — for now the artist's works,
// filtered by All / Base works and Type (the address's `base` and `type`,
// the Catalogue's meanings — see ArtworkFilterInput).
export default async function ArtistWorksPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ base?: string; type?: string }>;
}) {
  const { siteId } = await params;
  // Hidden for now (lib/artistApp.ts): the app starts on Arrange Pages.
  if (!ARTIST_APP_SHOWS_MANAGE_WORKS) redirect(artistAppHref(siteId, "pages"));
  const { base = "", type = "" } = await searchParams;

  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  const artistId = site!.artistId;

  const [{ rows, total }, settings] = await Promise.all([
    listArtworks(artistId, { base, type, limit: PAGE_SIZE }),
    getArtworkSettings(artistId),
  ]);

  return (
    <ArtistWorksView
      // A new filter starts the grid afresh.
      key={`${base}|${type}`}
      siteId={siteId}
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
