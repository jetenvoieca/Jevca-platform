"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { deleteLocationByCustomer } from "@/lib/actions/locations";
import { deleteArtworksByIds } from "@/lib/actions/artworkImport";
import { deleteImagesPermanently } from "@/lib/actions/imageDelete";
import { clearProfileEntries } from "@/lib/profileCatalogue";
import { FIXED_ENTRIES } from "@/lib/profileEntries";

// Delete all (2026-11-03, Craig's request — for testing the set-up of the
// ISYT sites end to end): an admin-only clear-out of a site, from the
// site header, of whichever of these are ticked:
// - pages: every page (its components, sign-up forms, canvas);
// - exhibitions & profile: every exhibition (archived ones too), every
//   Profile Catalogue story, and the fixed entries emptied (text,
//   picture, galleries) — they stay, as every artist has them;
// - locations: every Location and its contact card, as Delete does there;
// - artworks, curations & media: every curation, every artwork (with its
//   main picture) and every other picture or video (Hopper, Media
//   Catalogue…).
// The same rules as deleting one at a time: an artwork with a sale or
// sale terms, or a picture still used elsewhere, is kept and counted.
// Done in this order, so nothing deleted later is still in use.

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
  artworks: number;
  media: number;
  // What couldn't go, e.g. "3 artworks with sales".
  kept: string[];
};

export async function resetSite(siteId: string, parts: ResetParts): Promise<ResetResult | { error: string }> {
  await requireAdmin();
  const site = await db.site.findUnique({ where: { id: siteId }, select: { artistId: true } });
  if (!site) return { error: "Site not found." };
  const { artistId } = site;
  const result: ResetResult = {
    pages: 0,
    exhibitions: 0,
    stories: 0,
    locations: 0,
    curations: 0,
    artworks: 0,
    media: 0,
    kept: [],
  };

  if (parts.pages) {
    result.pages = (await db.page.deleteMany({ where: { siteId } })).count;
  }

  if (parts.exhibitionsProfile) {
    result.exhibitions = (await db.exhibition.deleteMany({ where: { artistId } })).count;
    result.stories = await clearProfileEntries(artistId, {
      fixed: FIXED_ENTRIES.map((f) => f.kind),
      stories: true,
    });
  }

  if (parts.locations) {
    const locations = await db.location.findMany({ where: { artistId }, select: { customerId: true } });
    for (const l of locations) await deleteLocationByCustomer(l.customerId, siteId);
    result.locations = locations.length;
  }

  if (parts.artworks) {
    result.curations = (await db.curation.deleteMany({ where: { artistId } })).count;
    const artworks = await db.artwork.findMany({ where: { artistId }, select: { id: true } });
    const done = await deleteArtworksByIds(
      siteId,
      artworks.map((a) => a.id),
    );
    result.artworks = done.deleted;
    if (done.failed.length) result.kept.push(`${done.failed.length} artworks with sales or sale terms`);
    const images = await db.image.findMany({ where: { artistId }, select: { id: true } });
    const media = await deleteImagesPermanently(
      artistId,
      images.map((i) => i.id),
    );
    result.media = media.deletedCount;
    if (media.failed.length) result.kept.push(`${media.failed.length} pictures or videos still used elsewhere`);
  }

  return result;
}
