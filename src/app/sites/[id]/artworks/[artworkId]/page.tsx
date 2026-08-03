import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listArtworks, getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import ArtworksCatalogueView from "../ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  sort?: string;
};

export default async function ArtworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; artworkId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id, artworkId } = await params;
  const sp = await searchParams;

  const site = await db.site.findUnique({ where: { id }, select: { artistId: true, defaultCurrency: true } });
  if (!site) notFound();
  const artistId = site.artistId;

  const [artworks, selected, settings] = await Promise.all([
    listArtworks(artistId, sp),
    getArtworkDetailForClient(artworkId),
    getArtworkSettings(artistId),
  ]);

  // An artwork belongs to the artist, not this particular site — so it's a
  // valid page as long as it's one of this artist's artworks, viewed via
  // any of their sites, not only the site it happened to be created from.
  if (!selected || selected.artistId !== artistId) notFound();

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    imageUrl: a.images[0]?.url ?? null,
  }));

  return (
    <ArtworksCatalogueView
      siteId={id}
      artistId={artistId}
      artworks={rows}
      q={sp.q || ""}
      availability={sp.availability || ""}
      location={sp.location || ""}
      type={sp.type || ""}
      group={sp.group || ""}
      sort={sp.sort || ""}
      selected={selected}
      settings={settings}
      siteDefaultCurrency={site.defaultCurrency}
    />
  );
}
