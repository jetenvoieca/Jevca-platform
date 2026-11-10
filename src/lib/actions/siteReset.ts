"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { deleteLocationByCustomer } from "@/lib/actions/locations";
import { deleteManyFromR2 } from "@/lib/r2";

// Delete all (2026-11-03, Craig's request — for clearing a site to set it
// up again): an admin-only clear-out of a site, from the site header, of
// whichever of these are ticked:
// - pages: every page (its components, sign-up forms, canvas);
// - exhibitions & profile: every exhibition (archived ones too), every
//   Profile Catalogue story, and the fixed entries emptied (text,
//   picture, galleries) — they stay, as every artist has them;
// - locations: every Location and its contact card, as Delete does there;
// - artworks, curations & media: every curation; every artwork except
//   one with a sale or at a Location (2026-11-10, Craig's choice); every
//   other picture or video (Hopper, Media Catalogue…) except a kept
//   artwork's picture or a rendered video's.
// resetSite does the quick parts (and curations). Artworks and media are
// then deleted in rounds by resetSiteContentRound, called again by the
// window until done (2026-11-10: one call for a whole catalogue ran past
// Netlify's 30-second limit and stopped part way). Locations go before
// artworks, so with both ticked only works with a sale are kept.

export type ResetParts = {
  pages: boolean;
  exhibitionsProfile: boolean;
  locations: boolean;
  artworks: boolean;
};

export type ResetResult = {
  pages: number;
  exhibitions: number;
  stories: number;
  locations: number;
  curations: number;
};

export type ResetRound = {
  artworks: number;
  media: number;
  // When nothing is left to delete: what stays.
  done: { keptArtworks: number; keptMedia: number } | null;
};

// Artworks or pictures deleted per round — well inside the time limit.
const ROUND = 200;

async function siteArtist(siteId: string): Promise<string | null> {
  await requireAdmin();
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  return site?.artistId ?? null;
}

export async function resetSite(siteId: string, parts: ResetParts): Promise<ResetResult | { error: string }> {
  const artistId = await siteArtist(siteId);
  if (!artistId) return { error: "Site not found." };
  const result: ResetResult = { pages: 0, exhibitions: 0, stories: 0, locations: 0, curations: 0 };

  if (parts.pages) {
    result.pages = (await db.page.deleteMany({ where: { siteId } })).count;
  }

  if (parts.exhibitionsProfile) {
    result.exhibitions = (await db.exhibition.deleteMany({ where: { artistId } })).count;
    const [stories] = await db.$transaction([
      db.profileStory.deleteMany({ where: { artistId, kind: "STORY" } }),
      db.profileGallery.deleteMany({ where: { story: { artistId } } }),
      db.profileStory.updateMany({ where: { artistId, kind: { not: "STORY" } }, data: { story: "", imageId: null } }),
    ]);
    result.stories = stories.count;
  }

  if (parts.locations) {
    const locations = await db.location.findMany({ where: { artistId }, select: { customerId: true } });
    for (const l of locations) await deleteLocationByCustomer(l.customerId, siteId);
    result.locations = locations.length;
  }

  if (parts.artworks) {
    result.curations = (await db.curation.deleteMany({ where: { artistId } })).count;
  }

  return result;
}

// One round of artworks, then (when none are left) of pictures and
// videos. Says how many went, and once nothing is left what was kept.
export async function resetSiteContentRound(siteId: string): Promise<ResetRound | { error: string }> {
  const artistId = await siteArtist(siteId);
  if (!artistId) return { error: "Site not found." };

  // Artworks: kept if sold or at one of the artist's Locations (the
  // Location field matching a Location's name, as "Works at …" lists).
  const locationNames = (await db.location.findMany({ where: { artistId }, select: { name: true } })).map(
    (l) => l.name,
  );
  const artworks = await db.artwork.findMany({
    where: {
      artistId,
      purchases: { none: {} },
      OR: [{ location: null }, { location: { notIn: locationNames } }],
    },
    select: { id: true },
    take: ROUND,
  });
  if (artworks.length > 0) {
    const { count } = await db.artwork.deleteMany({ where: { id: { in: artworks.map((a) => a.id) } } });
    return { artworks: count, media: 0, done: null };
  }

  // Pictures and videos: kept if a kept artwork's picture or a rendered
  // video's result. Files shared with a kept picture stay.
  const deletable = { artistId, mainImageOfArtwork: { is: null }, sourceVideoRender: { is: null } };
  const images = await db.image.findMany({
    where: deletable,
    select: { id: true, key: true, thumbnailKey: true, displayKey: true, squareKey: true },
    take: ROUND,
  });
  if (images.length > 0) {
    const { count } = await db.image.deleteMany({ where: { id: { in: images.map((i) => i.id) } } });
    const keys = [...new Set(images.flatMap((i) => [i.key, i.thumbnailKey, i.displayKey, i.squareKey]))].filter(
      (k): k is string => !!k,
    );
    const stillUsed = await db.image.findMany({
      where: {
        OR: [
          { key: { in: keys } },
          { thumbnailKey: { in: keys } },
          { displayKey: { in: keys } },
          { squareKey: { in: keys } },
        ],
      },
      select: { key: true, thumbnailKey: true, displayKey: true, squareKey: true },
    });
    const used = new Set(stillUsed.flatMap((r) => [r.key, r.thumbnailKey, r.displayKey, r.squareKey]));
    await deleteManyFromR2(keys.filter((k) => !used.has(k))).catch(() => {});
    return { artworks: 0, media: count, done: null };
  }

  const [keptArtworks, keptMedia] = await Promise.all([
    db.artwork.count({ where: { artistId } }),
    db.image.count({ where: { artistId } }),
  ]);
  return { artworks: 0, media: 0, done: { keptArtworks, keptMedia } };
}
