import { db } from "@/lib/db";

// Administration → Catalogue (2026-11-14, Craig): every client's works, one
// client at a time. Each client's Catalogue is reached through one of
// their sites — the first made — as the site's own Catalogue is (its
// actions check access and refresh by site). Callers check it's an admin.

export type CatalogueArtist = { id: string; name: string; siteId: string; works: number };

// Every client with a site, by name, with their works' count.
export async function listCatalogueArtists(): Promise<CatalogueArtist[]> {
  const artists = await db.artist.findMany({
    where: { sites: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sites: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
      _count: { select: { artworks: true } },
    },
  });
  return artists.map((a) => ({ id: a.id, name: a.name, siteId: a.sites[0].id, works: a._count.artworks }));
}
