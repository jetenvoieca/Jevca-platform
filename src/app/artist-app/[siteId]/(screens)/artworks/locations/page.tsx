import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listLocationCustomers } from "@/lib/actions/locations";
import { getArtworkSettings } from "@/lib/actions/artworkSettings";
import { listArtworkNames } from "@/lib/actions/artworks";
import { artistAppHref } from "@/lib/artistApp";
import { readSiteFeatures } from "@/lib/siteFeaturesData";
import ArtistLocationView from "@/components/artist-app/ArtistLocationView";

export const dynamic = "force-dynamic";

// A location in the Art manager (2026-11-11): the admin's Locations for
// the address's ?location= (a Location's contact card), with Art Manager
// only. No location, back to the works.
export default async function ArtistLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { siteId } = await params;
  const { location } = await searchParams;
  if (!(await readSiteFeatures(siteId)).catalogue) redirect(artistAppHref(siteId, "pages"));
  if (!location) redirect(artistAppHref(siteId, "artworks"));

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artistId: true, artist: { select: { name: true, vatRate: true } } },
  });
  if (!site) notFound();
  const [galleries, settings, names] = await Promise.all([
    listLocationCustomers(site.artistId),
    getArtworkSettings(site.artistId),
    listArtworkNames(site.artistId),
  ]);

  return (
    <ArtistLocationView
      siteId={siteId}
      artistId={site.artistId}
      artistName={site.artist.name}
      vatRate={site.artist.vatRate != null ? Number(site.artist.vatRate) : null}
      galleries={galleries}
      settings={settings}
      location={location}
      names={names}
    />
  );
}
