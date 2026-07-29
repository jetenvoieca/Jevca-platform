import { notFound } from "next/navigation";
import { getArtwork } from "@/lib/actions/artworks";
import ArtworkEditor from "./ArtworkEditor";

export default async function ArtworkEditorPage({
  params,
}: {
  params: Promise<{ id: string; artworkId: string }>;
}) {
  const { id, artworkId } = await params;
  const artwork = await getArtwork(artworkId);
  if (!artwork || artwork.siteId !== id) notFound();

  // Convert the Decimal price to a plain string before sending to the client component.
  const serialized = {
    id: artwork.id,
    siteId: artwork.siteId,
    title: artwork.title,
    catalogueNumber: artwork.catalogueNumber,
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    year: artwork.year,
    price: artwork.price != null ? artwork.price.toString() : null,
    availability: artwork.availability,
    visible: artwork.visible,
    description: artwork.description,
    images: artwork.images.map((img) => ({ id: img.id, url: img.url })),
  };

  return <ArtworkEditor siteId={id} artwork={serialized} />;
}
