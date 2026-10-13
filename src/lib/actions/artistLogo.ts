"use server";

import { db } from "@/lib/db";
import { storedFileUrl } from "@/lib/r2";

// The artist's Logo (Settings → Invoicing), for a page's Logo component
// (2026-10-13) — null if none has been uploaded.
export async function getArtistLogoUrl(artistId: string): Promise<string | null> {
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: { logoUrl: true },
  });
  return artist?.logoUrl ? storedFileUrl(artist.logoUrl) : null;
}
