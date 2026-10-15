"use server";

import { db } from "@/lib/db";
import { toArtworkImages } from "@/lib/artworkImages";
import {
  CAPTION_MAX,
  CAROUSEL_MAX,
  type SocialMediaItem,
  type SocialPostFormat,
  type SocialPostRow,
} from "@/lib/socialPosts";

// Marketing → Social Media (2026-10-15) — an artist's social posts. See
// lib/socialPosts.ts for the rules. Only drafts can be changed.

const IMAGE_SELECT = {
  id: true,
  url: true,
  thumbnailKey: true,
  displayKey: true,
  kind: true,
  posterUrl: true,
} as const;

function toItems(images: Parameters<typeof toArtworkImages>[0]): SocialMediaItem[] {
  return toArtworkImages(images, null).map(({ id, url, kind, posterUrl }) => ({
    id,
    url,
    kind,
    posterUrl,
  }));
}

export async function listSocialPosts(artistId: string): Promise<SocialPostRow[]> {
  const posts = await db.socialPost.findMany({
    where: { artistId },
    orderBy: { updatedAt: "desc" },
    include: { media: { orderBy: { position: "asc" }, include: { image: { select: IMAGE_SELECT } } } },
  });
  return posts.map((p) => ({
    id: p.id,
    format: p.format,
    caption: p.caption,
    status: p.status,
    media: toItems(p.media.map((m) => m.image)),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function createSocialPost(artistId: string): Promise<SocialPostRow> {
  const post = await db.socialPost.create({ data: { artistId } });
  return {
    id: post.id,
    format: post.format,
    caption: post.caption,
    status: post.status,
    media: [],
    updatedAt: post.updatedAt.toISOString(),
  };
}

// The picker's picks as post items: media as picked, each artwork as its
// Main image (or its first, if it has no Main).
export async function socialMediaForPicks(
  artistId: string,
  picks: { imageIds: string[]; artworkIds: string[] }
): Promise<SocialMediaItem[]> {
  const artworks = await db.artwork.findMany({
    where: { id: { in: picks.artworkIds }, artistId },
    select: { id: true, mainImageId: true, images: { take: 1, select: { id: true } } },
  });
  const artworkImageIds = picks.artworkIds.flatMap((id) => {
    const artwork = artworks.find((a) => a.id === id);
    const imageId = artwork?.mainImageId ?? artwork?.images[0]?.id;
    return imageId ? [imageId] : [];
  });
  const ids = [...picks.imageIds, ...artworkImageIds];
  const images = await db.image.findMany({ where: { id: { in: ids }, artistId }, select: IMAGE_SELECT });
  const byId = new Map(toItems(images).map((item) => [item.id, item]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function updateSocialPost(
  artistId: string,
  id: string,
  draft: { format: SocialPostFormat; caption: string; imageIds: string[] }
): Promise<{ ok: true } | { error: string }> {
  const post = await db.socialPost.findFirst({ where: { id, artistId }, select: { status: true } });
  if (!post) return { error: "That post couldn't be found." };
  if (post.status !== "DRAFT") return { error: "Only a draft can be changed." };
  if (draft.format !== "POST" && draft.format !== "STORY") return { error: "Unknown format." };
  if (draft.caption.length > CAPTION_MAX) return { error: `The caption is over ${CAPTION_MAX} characters.` };
  if (draft.imageIds.length > CAROUSEL_MAX) return { error: `At most ${CAROUSEL_MAX} items.` };

  const own = await db.image.findMany({
    where: { id: { in: draft.imageIds }, artistId },
    select: { id: true },
  });
  const ownIds = new Set(own.map((i) => i.id));
  const imageIds = draft.imageIds.filter((imageId) => ownIds.has(imageId));

  await db.$transaction([
    db.socialPostMedia.deleteMany({ where: { postId: id } }),
    db.socialPostMedia.createMany({
      data: imageIds.map((imageId, position) => ({ postId: id, imageId, position })),
    }),
    db.socialPost.update({ where: { id }, data: { format: draft.format, caption: draft.caption } }),
  ]);
  return { ok: true };
}

export async function deleteSocialPost(
  artistId: string,
  id: string
): Promise<{ ok: true } | { error: string }> {
  const post = await db.socialPost.findFirst({ where: { id, artistId }, select: { status: true } });
  if (!post) return { ok: true };
  if (post.status === "POSTING") return { error: "This post is being sent — try again shortly." };
  await db.socialPost.delete({ where: { id } });
  return { ok: true };
}
