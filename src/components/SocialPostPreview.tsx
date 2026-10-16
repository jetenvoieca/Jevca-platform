"use client";

import { useState } from "react";
import { socialPostType, type SocialMediaItem, type SocialPostRow } from "@/lib/socialPosts";

// How a social post will look on Instagram (2026-10-16) — beside the post
// editor, changing as it's edited. A Post shows as in the feed (pictures
// at their own shape, kept between Instagram's 4:5 and 1.91:1, every
// carousel item at the first one's shape), a Reel and a Story full
// screen at 9:16. The caption is cut after about two lines with "more",
// as Instagram does.

const MIN_RATIO = 0.8; // 4:5
const MAX_RATIO = 1.91;
const CAPTION_CUT = 125;

function Media({ item, cover }: { item: SocialMediaItem; cover: boolean }) {
  const fit = cover ? "object-cover" : "object-contain";
  return item.kind === "VIDEO" ? (
    <video
      key={item.fullUrl}
      src={item.fullUrl}
      poster={item.posterUrl ?? undefined}
      className={`h-full w-full bg-black ${fit}`}
      autoPlay
      muted
      loop
      playsInline
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.fullUrl} alt="" className={`h-full w-full ${fit}`} />
  );
}

function Header({ username, light }: { username: string; light?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold ${light ? "text-white" : "text-neutral-900"}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-xs text-white">
        {username.charAt(0).toUpperCase()}
      </span>
      {username}
    </div>
  );
}

function Caption({ username, caption, light }: { username: string; caption: string; light?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!caption) return null;
  const cut = !expanded && caption.length > CAPTION_CUT;
  return (
    <p className={`whitespace-pre-line px-3 pb-3 text-sm ${light ? "text-white" : "text-neutral-900"}`}>
      <span className="font-semibold">{username}</span> {cut ? caption.slice(0, CAPTION_CUT).trimEnd() : caption}
      {cut && (
        <button type="button" onClick={() => setExpanded(true)} className="text-neutral-400">
          … more
        </button>
      )}
    </p>
  );
}

export default function SocialPostPreview({
  post,
  username,
}: {
  post: Pick<SocialPostRow, "format" | "caption" | "reelInFeed" | "media">;
  username: string;
}) {
  const [index, setIndex] = useState(0);
  // The first item's shape, once its picture or video has loaded.
  const [firstRatio, setFirstRatio] = useState<{ url: string; ratio: number } | null>(null);

  const media = post.media;
  const current = media[Math.min(index, media.length - 1)];
  const first = media[0];
  const ratio = first && firstRatio?.url === first.fullUrl ? firstRatio.ratio : 1;
  const feedRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

  const frame = "w-[320px] overflow-hidden rounded-xl border border-neutral-200 shadow-sm";

  if (!current) {
    return (
      <div className={`${frame} flex aspect-[9/16] items-center justify-center bg-white text-sm text-neutral-400`}>
        Add media to see the preview
      </div>
    );
  }

  // Measures the first item (hidden), for the feed's shape.
  const measure = first && first.fullUrl !== firstRatio?.url && (
    first.kind === "VIDEO" ? (
      <video
        src={first.fullUrl}
        className="hidden"
        preload="metadata"
        onLoadedMetadata={(e) =>
          setFirstRatio({ url: first.fullUrl, ratio: e.currentTarget.videoWidth / e.currentTarget.videoHeight || 1 })
        }
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={first.fullUrl}
        alt=""
        className="hidden"
        onLoad={(e) =>
          setFirstRatio({ url: first.fullUrl, ratio: e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1 })
        }
      />
    )
  );

  if (post.format === "STORY") {
    return (
      <div className={`${frame} relative aspect-[9/16] bg-black`}>
        <Media item={current} cover />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent">
          <div className="mx-3 mt-2 h-0.5 rounded bg-white/80" />
          <Header username={username} light />
        </div>
      </div>
    );
  }

  if (post.format === "REEL") {
    return (
      <div className="space-y-2">
        <div className={`${frame} relative aspect-[9/16] bg-black`}>
          <Media item={current} cover />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent pt-10">
            <Header username={username} light />
            <Caption username={username} caption={post.caption} light />
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          {post.reelInFeed ? "Shown in the Reels tab and the main feed." : "Shown in the Reels tab only."}
        </p>
      </div>
    );
  }

  return (
    <div className={`${frame} bg-white`}>
      {measure}
      <Header username={username} />
      <div className="relative bg-neutral-100" style={{ aspectRatio: feedRatio }}>
        <Media item={current} cover />
        {media.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {index + 1}/{media.length}
            </span>
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white/80 text-sm"
                aria-label="Previous"
              >
                ‹
              </button>
            )}
            {index < media.length - 1 && (
              <button
                type="button"
                onClick={() => setIndex(index + 1)}
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white/80 text-sm"
                aria-label="Next"
              >
                ›
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-lg text-neutral-900">
        <span className="flex gap-3">♡ 💬 ➤</span>
        {media.length > 1 && (
          <span className="flex gap-1">
            {media.map((m, i) => (
              <span key={`${m.id}-${i}`} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-sky-500" : "bg-neutral-300"}`} />
            ))}
          </span>
        )}
        <span>⌑</span>
      </div>
      <Caption username={username} caption={post.caption} />
      <p className="px-3 pb-3 text-[10px] uppercase tracking-wide text-neutral-400">
        {socialPostType(post.format, media)}
      </p>
    </div>
  );
}
