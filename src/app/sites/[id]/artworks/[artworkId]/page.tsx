import { notFound } from "next/navigation";
import { listArtworks, getArtworkDetail } from "@/lib/actions/artworks";
import ArtworksCatalogueView from "../ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  visibility?: string;
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

  const [artworks, artwork] = await Promise.all([
    listArtworks(id, sp),
    getArtworkDetail(artworkId),
  ]);

  if (!artwork || artwork.siteId !== id) notFound();

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    visible: a.visible,
    imageUrl: a.images[0]?.url ?? null,
  }));

  // Decimal fields aren't serializable across the server/client boundary as-is.
  const selected = {
    id: artwork.id,
    siteId: artwork.siteId,
    catalogueNumber: artwork.catalogueNumber,
    presentationTitle: artwork.presentationTitle,
    presentationPrice: artwork.presentationPrice != null ? artwork.presentationPrice.toString() : null,
    dimensions: artwork.dimensions,
    description: artwork.description,
    medium: artwork.medium,
    presentationGroup: artwork.presentationGroup,
    availability: artwork.availability,
    visible: artwork.visible,
    catalogueName: artwork.catalogueName,
    year: artwork.year,
    type: artwork.type,
    catalogueGroup: artwork.catalogueGroup,
    size: artwork.size,
    location: artwork.location,
    edition: artwork.edition,
    availableQty: artwork.availableQty,
    priceUnframed: artwork.priceUnframed != null ? artwork.priceUnframed.toString() : null,
    priceFramed: artwork.priceFramed != null ? artwork.priceFramed.toString() : null,
    studioNotes: artwork.studioNotes,
    images: artwork.images.map((img) => ({ id: img.id, url: img.url })),
  };

  return (
    <ArtworksCatalogueView
      siteId={id}
      artworks={rows}
      q={sp.q || ""}
      availability={sp.availability || ""}
      visibility={sp.visibility || ""}
      sort={sp.sort || ""}
      selected={selected}
    />
  );
}
