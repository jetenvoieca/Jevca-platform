"use server";

import { requireArtistAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { EMAIL_DOMAIN } from "@/lib/email";
import { storedFileUrl } from "@/lib/r2";
import { artistTownLine, type SiteArtist } from "@/lib/siteArtist";

// What a site's pages show about its artist (2026-10-13) — see
// lib/siteArtist.ts. Used live by the admin preview and saved in the
// published snapshot.
export async function getSiteArtist(artistId: string): Promise<SiteArtist | null> {
  await requireArtistAccess(artistId);
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: {
      name: true,
      logoUrl: true,
      emailSlug: true,
      postcode: true,
      city: true,
      country: true,
      showFooterAddress: true,
      logoByline: true,
      instagramHandle: true,
      facebookUrl: true,
    },
  });
  if (!artist) return null;
  return {
    logoUrl: artist.logoUrl ? storedFileUrl(artist.logoUrl) : null,
    logoByline: artist.logoByline,
    social: {
      instagramUrl: artist.instagramHandle
        ? `https://www.instagram.com/${encodeURIComponent(artist.instagramHandle)}`
        : null,
      facebookUrl: artist.facebookUrl,
    },
    footer: {
      name: artist.name,
      town: artist.showFooterAddress ? artistTownLine(artist) : null,
      email: artist.emailSlug ? `${artist.emailSlug}@${EMAIL_DOMAIN}` : null,
    },
  };
}
