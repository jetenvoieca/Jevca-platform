"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// The Hopper is simply the set of Images with status HOPPER for a given
// artist — no new table, reuses the Image model exactly as designed in
// hopper-design.md.

export async function countHopper(artistId: string): Promise<number> {
  return db.image.count({ where: { artistId, status: "HOPPER" } });
}

// Oldest-first — matches the "receive order" flick-through rhythm from
// the original spec, and matches the rest of the app's "new item lands
// at the end" convention (Media Catalogue's own default sort).
export async function listHopperQueue(artistId: string) {
  return db.image.findMany({
    where: { artistId, status: "HOPPER" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      posterUrl: true,
      kind: true,
      caption: true,
      altText: true,
      tags: true,
      createdAt: true,
    },
  });
}

// Autosaves while sorting — caption/tags are now added here rather than
// from the Shortcut (see hopper-design.md, "caption only in the Hopper").
export async function updateHopperCaption(
  id: string,
  siteId: string,
  formData: FormData
): Promise<void> {
  const caption = (formData.get("caption") as string)?.trim() || null;
  const altText = (formData.get("altText") as string)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string)?.trim() || "";
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  await db.image.update({ where: { id }, data: { caption, altText, tags } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

// "Bin" = archive, same as every other delete in this app — reversible,
// not a hard delete (confirmed in hopper-design.md, §4).
export async function binHopperItem(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

// Leaves it unlinked from any artwork — shows up as Marketing media in
// the Media Catalogue, per the existing "Marketing = no artworkId" rule.
export async function addHopperItemToMedia(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "SORTED" } });
  revalidatePath(`/sites/${siteId}/hopper`);
}

export async function countBucket(artistId: string): Promise<number> {
  return db.image.count({ where: { artistId, status: "BUCKET" } });
}

// Takes an item out of the Bucket without archiving it — becomes an
// ordinary Sorted Media Catalogue item, same "nothing destroyed" default
// as everywhere else. See bucket-video-editor-design.md.
export async function removeFromBucket(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "SORTED" } });
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Oldest-first, matching the Hopper's own convention — the actual
// reorderable sequence (for the real Video Editor strip) is a follow-up
// build; this is the plain listing used until then.
export async function listBucket(artistId: string) {
  return db.image.findMany({
    where: { artistId, status: "BUCKET" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      posterUrl: true,
      kind: true,
      caption: true,
      createdAt: true,
    },
  });
}

// Moves an item into the Bucket — the Video Editor's staging area, not a
// finished destination the way Media/Artwork are. See
// bucket-video-editor-design.md.
export async function addHopperItemToBucket(id: string, siteId: string): Promise<void> {
  await db.image.update({ where: { id }, data: { status: "BUCKET" } });
  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/bucket`);
}

// Links the image to an artwork (becomes Related media / an ancillary
// image), and — only if the sorter explicitly checked "Set as main
// image" — also updates that artwork's formal mainImageId. Both writes
// happen together so an artwork can never briefly point at a
// still-HOPPER image.
export async function addHopperItemToArtwork(
  id: string,
  siteId: string,
  artworkId: string,
  setAsMain: boolean
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.image.update({ where: { id }, data: { status: "SORTED", artworkId } });
    if (setAsMain) {
      await tx.artwork.update({ where: { id: artworkId }, data: { mainImageId: id } });
    }
  });
  revalidatePath(`/sites/${siteId}/hopper`);
  revalidatePath(`/sites/${siteId}/artworks`);
}
