import ArtworkCatalogueScreen, { type CatalogueSearchParams } from "@/components/ArtworkCatalogueScreen";

export const dynamic = "force-dynamic";

// The Artwork Catalogue — see ArtworkCatalogueScreen (shared with the
// Artist App's Catalogue). Access is checked by the site's layout.
export default async function ArtworksCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CatalogueSearchParams>;
}) {
  const { id } = await params;
  return <ArtworkCatalogueScreen siteId={id} sp={await searchParams} />;
}
