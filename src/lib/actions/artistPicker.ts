"use server";

import { db } from "@/lib/db";

// The full platform artist list, for the Curator edit form's "tick which
// Artists this Curator represents" selector (2026-08-30). Deliberately
// not scoped to any one site — a Curator can tick any artist on the
// platform, not just ones with a site of their own yet. Shows the
// artist's first site's name alongside their own name (if they have
// one) purely so two similarly-named artists, or an artist the person
// half-remembers by their site's name, are both easy to tell apart in a
// long list — an artist with no site at all just shows their name alone.
export async function getAllArtistsForPicker() {
  const artists = await db.artist.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      sites: { take: 1, select: { name: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return artists.map((a) => ({
    id: a.id,
    name: a.name,
    siteName: a.sites[0]?.name ?? null,
  }));
}
