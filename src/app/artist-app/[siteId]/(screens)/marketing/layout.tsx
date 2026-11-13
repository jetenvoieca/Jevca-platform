import { redirect } from "next/navigation";
import { artistAppHref } from "@/lib/artistApp";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import ArtistMarketingMenu from "@/components/artist-app/ArtistMarketingMenu";

// Marketing manager (2026-11-13): with Marketing Manager only; its items
// listed in the app's side panel in place of the pages.
export default async function ArtistMarketingLayout({
  params,
  children,
}: {
  params: Promise<{ siteId: string }>;
  children: React.ReactNode;
}) {
  const { siteId } = await params;
  if (!(await readSiteFeatures(siteId)).marketing) redirect(artistAppHref(siteId, "pages"));
  return (
    <>
      <ArtistMarketingMenu siteId={siteId} />
      {children}
    </>
  );
}
