import { db } from "@/lib/db";
import { listProfileCatalogue } from "@/lib/actions/profileStories";
import { readLocations } from "@/lib/artworkSettingsData";
import ArtistCvView from "@/components/artist-app/ArtistCvView";

export const dynamic = "force-dynamic";

// Update CV (2026-11-08, Craig's mockups): the Profile Catalogue's fixed
// entries and the client's Profile under Biography, then the stories.
export default async function ArtistCvPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      artist: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          addressLine1: true,
          city: true,
          postcode: true,
          country: true,
          instagramHandle: true,
          facebookUrl: true,
          logoUrl: true,
        },
      },
    },
  });
  const artist = site!.artist;

  // Checked by listProfileCatalogue first. The Locations of type Gallery,
  // for the Galleries entry.
  const entries = await listProfileCatalogue(artist.id);
  const galleries = (await readLocations(artist.id)).filter((l) => l.type === "GALLERY");

  return (
    <ArtistCvView
      siteId={siteId}
      artist={artist}
      initialEntries={entries}
      galleries={galleries.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
