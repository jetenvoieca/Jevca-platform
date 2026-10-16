// Marketing → Social Media (2026-10-15) — the rules for an Instagram
// post, shared by the Social page and the server. A POST is one picture,
// or a carousel of 2–10 pictures and videos; a REEL is one video; a STORY
// is one picture or video, with no caption.

export type SocialPostFormat = "POST" | "REEL" | "STORY";

export const SOCIAL_FORMATS: SocialPostFormat[] = ["POST", "REEL", "STORY"];

export const SOCIAL_FORMAT_LABEL: Record<SocialPostFormat, string> = {
  POST: "Post",
  REEL: "Reel",
  STORY: "Story",
};
export type SocialPostStatus = "DRAFT" | "SCHEDULED" | "POSTING" | "POSTED" | "FAILED";

export const SOCIAL_STATUSES: SocialPostStatus[] = ["DRAFT", "SCHEDULED", "POSTED", "FAILED"];

export const SOCIAL_STATUS_LABEL: Record<SocialPostStatus, string> = {
  DRAFT: "Drafts",
  SCHEDULED: "Scheduled",
  POSTING: "Posting",
  POSTED: "Posted",
  FAILED: "Failed",
};

// Instagram's own limits.
export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
export const CAROUSEL_MAX = 10;

export type SocialMediaItem = {
  id: string;
  // Small version, for tiles.
  url: string;
  // As posted (pictures at the larger size), for the preview.
  fullUrl: string;
  kind: string;
  posterUrl: string | null;
  mimeType: string;
};

export type SocialPostRow = {
  id: string;
  format: SocialPostFormat;
  caption: string;
  // A Reel also shown in the main feed, not only the Reels tab.
  reelInFeed: boolean;
  status: SocialPostStatus;
  media: SocialMediaItem[];
  updatedAt: string;
  // Once posted: the post on Instagram, and when. If posting failed, why.
  permalink: string | null;
  postedAt: string | null;
  error: string | null;
};

// The file types Instagram takes.
const POSTABLE_TYPES = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];

// A draft can be changed and posted; so can one whose posting failed.
export function isEditable(status: SocialPostStatus): boolean {
  return status === "DRAFT" || status === "FAILED";
}

// What Instagram will make of it.
export function socialPostType(format: SocialPostFormat, media: unknown[]): string {
  if (format === "POST") return media.length > 1 ? "Carousel" : "Picture";
  return SOCIAL_FORMAT_LABEL[format];
}

export function countHashtags(caption: string): number {
  return caption.match(/#[^\s#]+/g)?.length ?? 0;
}

// Why the post can't go out as it is, or null.
export function socialPostProblem(post: {
  format: SocialPostFormat;
  caption: string;
  media: { kind: string; mimeType: string }[];
}): string | null {
  if (post.media.length === 0) return post.format === "REEL" ? "Add a video." : "Add a picture or video.";
  if (post.media.some((m) => !POSTABLE_TYPES.includes(m.mimeType))) {
    return "Instagram takes JPEG or PNG pictures and MP4 or MOV videos only.";
  }
  if (post.format === "REEL" && (post.media.length > 1 || post.media[0].kind !== "VIDEO")) {
    return "A Reel is one video.";
  }
  // Instagram makes a single video a Reel.
  if (post.format === "POST" && post.media.length === 1 && post.media[0].kind === "VIDEO") {
    return "One video on its own goes out as a Reel — choose Reel.";
  }
  if (post.format === "STORY" && post.media.length > 1) return "A Story has one picture or video.";
  if (post.media.length > CAROUSEL_MAX) return `A carousel has at most ${CAROUSEL_MAX} items.`;
  if (post.caption.length > CAPTION_MAX) return `The caption is over ${CAPTION_MAX} characters.`;
  if (countHashtags(post.caption) > HASHTAG_MAX) return `At most ${HASHTAG_MAX} hashtags.`;
  return null;
}
