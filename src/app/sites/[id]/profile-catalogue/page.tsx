import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listProfileCatalogue } from "@/lib/actions/profileStories";
import { readLocations } from "@/lib/artworkSettingsData";
import ProfileCatalogueView from "@/components/ProfileCatalogueView";

// The Profile Catalogue (2026-10-26) — see ProfileStory in schema.prisma.
// Force-dynamic like the Artwork Catalogue: the view keeps itself up to
// date client-side and must never be served stale.
export const dynamic = "force-dynamic";

export default async function ProfileCataloguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  if (!site) notFound();

  // Checked by listProfileCatalogue first. The Locations of type Gallery,
  // for the Galleries entry (2026-11-03).
  const stories = await listProfileCatalogue(site.artistId);
  const galleries = (await readLocations(site.artistId)).filter((l) => l.type === "GALLERY");
  return (
    <ProfileCatalogueView
      artistId={site.artistId}
      siteId={id}
      initialStories={stories}
      galleries={galleries.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
