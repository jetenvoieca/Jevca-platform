import { redirect } from "next/navigation";
import ArtworkCatalogueScreen, { type CatalogueSearchParams } from "@/components/ArtworkCatalogueScreen";
import { artistAppHref } from "@/lib/artistApp";
import { readSiteFeatures } from "@/lib/siteFeaturesData";

export const dynamic = "force-dynamic";

// Catalogue (2026-11-10, Craig's request): with Art Manager, the admin's
// Artwork Catalogue as it is, in the Artist App's frame. Without it, back
// to Pages. Access to the site is checked by the app's layout.
export default async function ArtistCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<CatalogueSearchParams>;
}) {
  const { siteId } = await params;
  if (!(await readSiteFeatures(siteId)).catalogue) redirect(artistAppHref(siteId, "pages"));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white">
      <ArtworkCatalogueScreen siteId={siteId} sp={await searchParams} basePath={artistAppHref(siteId)} />
    </div>
  );
}
