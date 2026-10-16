import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { zernio } from "@/lib/zernio";
import { socialPostProblem, isEditable } from "@/lib/socialPosts";

// Posting a social post to the artist's Instagram through Zernio
// (2026-10-16). "Post now" hands the post to Zernio to publish a minute
// later — Zernio does the work in the background, so a long video can
// take the time Instagram needs — and the post is POSTING until Zernio
// says it's published (POSTED, with its link) or failed (FAILED, with
// why). Media goes by its public R2 address. Server-only.

// How long after "Post now" Zernio publishes it.
const POST_NOW_DELAY_MS = 60 * 1000;

type ZernioPost = {
  post?: {
    _id?: string;
    status?: string;
    platforms?: { status?: string; platformPostUrl?: string; errorMessage?: string }[];
  };
};

// Hands the post to Zernio. Returns why not, if it can't go.
export async function startSocialPosting(artistId: string, postId: string): Promise<{ error: string } | null> {
  const post = await db.socialPost.findFirst({
    where: { id: postId, artistId },
    include: {
      media: { orderBy: { position: "asc" }, include: { image: { select: { key: true, kind: true, mimeType: true } } } },
    },
  });
  if (!post) return { error: "That post couldn't be found." };
  if (!isEditable(post.status)) return { error: "This post has already been sent." };
  const media = post.media.map((m) => m.image);
  const problem = socialPostProblem({ format: post.format, caption: post.caption, media });
  if (problem) return { error: problem };

  const connection = await db.instagramConnection.findUnique({ where: { artistId } });
  if (!connection) return { error: "Connect Instagram first, in Marketing → Settings." };

  const mediaItems = media.map((image) => ({
    type: image.kind === "VIDEO" ? "video" : "image",
    url: publicMediaUrl(image.key),
  }));
  if (mediaItems.some((item) => !item.url)) return { error: "The media's public address isn't set up (R2_PUBLIC_URL)." };

  // Claimed first, so a double click can't send it twice.
  const attempt = post.updatedAt.getTime();
  const claimed = await db.socialPost.updateMany({
    where: { id: post.id, status: { in: ["DRAFT", "FAILED"] } },
    data: { status: "POSTING", error: null },
  });
  if (claimed.count === 0) return { error: "This post has already been sent." };

  try {
    const result = await zernio<ZernioPost>("/posts", {
      method: "POST",
      headers: { "Idempotency-Key": `social-${post.id}-${attempt}` },
      body: {
        ...(post.format === "STORY" ? {} : { content: post.caption }),
        mediaItems,
        platforms: [
          {
            platform: "instagram",
            accountId: connection.zernioAccountId,
            ...(post.format === "STORY" ? { platformSpecificData: { contentType: "story" } } : {}),
          },
        ],
        scheduledFor: new Date(Date.now() + POST_NOW_DELAY_MS).toISOString(),
      },
    });
    const zernioPostId = result.post?._id;
    if (!zernioPostId) throw new Error("Zernio didn't confirm the post.");
    await db.socialPost.update({ where: { id: post.id }, data: { zernioPostId } });
    return null;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Couldn't send the post.";
    await db.socialPost.update({ where: { id: post.id }, data: { status: "FAILED", error } });
    return { error };
  }
}

// Asks Zernio how a post being posted is getting on, and records the
// outcome once there is one.
export async function checkSocialPosting(postId: string): Promise<void> {
  const post = await db.socialPost.findUnique({ where: { id: postId }, select: { status: true, zernioPostId: true } });
  if (post?.status !== "POSTING" || !post.zernioPostId) return;

  let result: ZernioPost;
  try {
    result = await zernio<ZernioPost>(`/posts/${post.zernioPostId}`);
  } catch {
    return; // Zernio unreachable — asked again next time.
  }
  const status = result.post?.status;
  const platform = result.post?.platforms?.[0];
  if (status === "published") {
    await db.socialPost.update({
      where: { id: postId },
      data: { status: "POSTED", permalink: platform?.platformPostUrl ?? null, postedAt: new Date() },
    });
  } else if (status === "failed" || status === "partial") {
    await db.socialPost.update({
      where: { id: postId },
      data: { status: "FAILED", error: platform?.errorMessage || "Instagram didn't accept the post." },
    });
  }
}
