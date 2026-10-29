"use server";

import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { checkSocialPosting, startSocialPosting } from "@/lib/socialPublishing";
import {
  CAPTION_MAX,
  CAROUSEL_MAX,
  SOCIAL_FORMATS,
  isEditable,
  type SocialMediaItem,
  type SocialPostFormat,
  type SocialPostRow,
} from "@/lib/socialPosts";

// Marketing → Social Media (2026-10-15) — an artist's social posts. See
// lib/socialPosts.ts for the rules and lib/socialPublishing.ts for
// posting. Drafts, and posts whose posting failed, can be changed.

const IMAGE_SELECT = {
  id: true,
  url: true,
  thumbnailKey: true,
  displayKey: true,
  kind: true,
  posterUrl: true,
  mimeType: true,
  caption: true,
  artwork: { select: { catalogueName: true } },
} as const;

type ImageRow = {
  id: string;
  url: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  kind: string;
  posterUrl: string | null;
  mimeType: string;
  caption: string | null;
  artwork: { catalogueName: string } | null;
};

function toItem(image: ImageRow): SocialMediaItem {
  return {
    id: image.id,
    name: image.caption || image.artwork?.catalogueName || null,
    url: publicMediaUrl(image.thumbnailKey) || image.url,
    fullUrl: (image.kind === "PHOTO" && publicMediaUrl(image.displayKey)) || image.url,
    kind: image.kind,
    posterUrl: image.posterUrl,
    mimeType: image.mimeType,
  };
}

const POST_INCLUDE = {
  media: { orderBy: { position: "asc" as const }, include: { image: { select: IMAGE_SELECT } } },
};

async function postRow(id: string): Promise<SocialPostRow | null> {
  const post = await db.socialPost.findUnique({ where: { id }, include: POST_INCLUDE });
  return post ? toRow(post) : null;
}

function toRow(p: {
  id: string;
  format: SocialPostFormat;
  caption: string;
  reelInFeed: boolean;
  status: SocialPostRow["status"];
  updatedAt: Date;
  permalink: string | null;
  postedAt: Date | null;
  error: string | null;
  media: { image: ImageRow }[];
}): SocialPostRow {
  return {
    id: p.id,
    format: p.format,
    caption: p.caption,
    reelInFeed: p.reelInFeed,
    status: p.status,
    media: p.media.map((m) => toItem(m.image)),
    updatedAt: p.updatedAt.toISOString(),
    permalink: p.permalink,
    postedAt: p.postedAt?.toISOString() ?? null,
    error: p.error,
  };
}

// Posts being posted are checked with Zernio first, so the list is
// up to date.
export async function listSocialPosts(artistId: string): Promise<SocialPostRow[]> {
  await requireArtistAccess(artistId);
  const posting = await db.socialPost.findMany({ where: { artistId, status: "POSTING" }, select: { id: true } });
  await Promise.all(posting.map((p) => checkSocialPosting(p.id)));
  const posts = await db.socialPost.findMany({
    where: { artistId },
    orderBy: { updatedAt: "desc" },
    include: POST_INCLUDE,
  });
  return posts.map(toRow);
}

export async function createSocialPost(artistId: string): Promise<SocialPostRow> {
  await requireArtistAccess(artistId);
  const post = await db.socialPost.create({ data: { artistId }, include: POST_INCLUDE });
  return toRow(post);
}

// "Post now": the post as it now stands, or why it couldn't go.
export async function publishSocialPost(
  artistId: string,
  id: string
): Promise<{ post: SocialPostRow } | { error: string; post: SocialPostRow | null }> {
  await requireArtistAccess(artistId);
  const failed = await startSocialPosting(artistId, id);
  const post = await postRow(id);
  if (failed) return { ...failed, post };
  return post ? { post } : { error: "That post couldn't be found.", post: null };
}

// How a post being posted is getting on.
export async function refreshSocialPost(artistId: string, id: string): Promise<SocialPostRow | null> {
  await requireArtistAccess(artistId);
  const owned = await db.socialPost.findFirst({ where: { id, artistId }, select: { id: true } });
  if (!owned) return null;
  await checkSocialPosting(id);
  return postRow(id);
}

// A new Reel draft holding one video (2026-10-16 — Video Edit's "Save &
// post to Social"). Its id, for opening it on the Social page.
export async function createReelFromVideo(imageId: string): Promise<string | null> {
  await requireRecordAccess(db.image.findUnique({ where: { id: imageId }, select: { artistId: true } }));
  const video = await db.image.findUnique({ where: { id: imageId }, select: { artistId: true, kind: true } });
  if (!video || video.kind !== "VIDEO") return null;
  const post = await db.socialPost.create({
    data: { artistId: video.artistId, format: "REEL", media: { create: [{ imageId, position: 0 }] } },
  });
  return post.id;
}

// The picker's picks as post items: media as picked, each artwork as its
// picture.
export async function socialMediaForPicks(
  artistId: string,
  picks: { imageIds: string[]; artworkIds: string[] }
): Promise<SocialMediaItem[]> {
  await requireArtistAccess(artistId);
  const artworks = await db.artwork.findMany({
    where: { id: { in: picks.artworkIds }, artistId },
    select: { id: true, mainImageId: true },
  });
  const artworkImageIds = picks.artworkIds.flatMap((id) => {
    const artwork = artworks.find((a) => a.id === id);
    const imageId = artwork?.mainImageId;
    return imageId ? [imageId] : [];
  });
  const ids = [...picks.imageIds, ...artworkImageIds];
  const images = await db.image.findMany({ where: { id: { in: ids }, artistId }, select: IMAGE_SELECT });
  const byId = new Map(images.map((image) => [image.id, toItem(image)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function updateSocialPost(
  artistId: string,
  id: string,
  draft: { format: SocialPostFormat; caption: string; reelInFeed: boolean; imageIds: string[] }
): Promise<{ ok: true } | { error: string }> {
  await requireArtistAccess(artistId);
  const post = await db.socialPost.findFirst({ where: { id, artistId }, select: { status: true } });
  if (!post) return { error: "That post couldn't be found." };
  if (!isEditable(post.status)) return { error: "This post has been sent, so it can't be changed." };
  if (!SOCIAL_FORMATS.includes(draft.format)) return { error: "Unknown format." };
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
    db.socialPost.update({
      where: { id },
      data: { format: draft.format, caption: draft.caption, reelInFeed: draft.reelInFeed === true },
    }),
  ]);
  return { ok: true };
}

export async function deleteSocialPost(
  artistId: string,
  id: string
): Promise<{ ok: true } | { error: string }> {
  await requireArtistAccess(artistId);
  const post = await db.socialPost.findFirst({ where: { id, artistId }, select: { status: true } });
  if (!post) return { ok: true };
  if (post.status === "POSTING") return { error: "This post is being sent — try again shortly." };
  await db.socialPost.delete({ where: { id } });
  return { ok: true };
}
