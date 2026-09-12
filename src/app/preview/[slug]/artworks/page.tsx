import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listArtworks, getArtworkDetailForClient } from "@/lib/actions/artworks";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { resolvePreviewSiteId } from "@/lib/previewSites";
import ArtworksCatalogueView from "@/app/sites/[id]/artworks/ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  location?: string;
  type?: string;
  group?: string;
  tier?: string;
  selected?: string;
};

const PAGE_SIZE = 60;

// Same data-loading as the real /sites/[id]/artworks page — reuses the
// exact same view component and server actions, resolving the preview
// slug to a real site id first. The only difference passed down is
// basePath, so every in-page link (currently just "+ Add New" ->
// Hopper) stays inside this reduced shell instead of jumping out to
// the full admin one.
export default async function PreviewArtworksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const siteId = resolvePreviewSiteId(slug);
  if (!siteId) notFound();

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artistId: true, defaultCurrency: true, artist: { select: { name: true } } },
  });
  if (!site) notFound();
  const artistId = site.artistId;

  const [{ rows: artworks, total, soldCount }, settings, selectedRaw] = await Promise.all([
    listArtworks(artistId, { ...sp, limit: PAGE_SIZE }),
    getArtworkSettings(artistId),
    sp.selected ? getArtworkDetailForClient(sp.selected) : Promise.resolve(null),
  ]);

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    catalogueName: a.catalogueName,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    type: a.type,
    catalogueGroup: a.catalogueGroup,
    imageUrl: a.images[0]?.url ?? null,
  }));

  const selected = selectedRaw && selectedRaw.artistId === artistId ? selectedRaw : null;

  return (
    <ArtworksCatalogueView
      siteId={siteId}
      basePath={`/preview/${slug}`}
      artistId={artistId}
      artistName={site.artist.name}
      artworks={rows}
      total={total}
      soldCount={soldCount}
      pageSize={PAGE_SIZE}
      q={sp.q || ""}
      availability={sp.availability || ""}
      location={sp.location || ""}
      type={sp.type || ""}
      group={sp.group || ""}
      tier={sp.tier || ""}
      initialSelected={selected}
      settings={settings}
      siteDefaultCurrency={site.defaultCurrency}
    />
  );
}
