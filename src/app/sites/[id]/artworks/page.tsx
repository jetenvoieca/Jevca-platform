import { listArtworks } from "@/lib/actions/artworks";
import ArtworksCatalogueView from "./ArtworksCatalogueView";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  availability?: string;
  visibility?: string;
  sort?: string;
};

export default async function ArtworksCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const artworks = await listArtworks(id, sp);

  const rows = artworks.map((a) => ({
    id: a.id,
    presentationTitle: a.presentationTitle,
    presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
    catalogueNumber: a.catalogueNumber,
    availability: a.availability,
    visible: a.visible,
    imageUrl: a.images[0]?.url ?? null,
  }));

  return (
    <ArtworksCatalogueView
      siteId={id}
      artworks={rows}
      q={sp.q || ""}
      availability={sp.availability || ""}
      visibility={sp.visibility || ""}
      sort={sp.sort || ""}
      selected={null}
    />
  );
}
