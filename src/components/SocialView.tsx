"use client";

import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import ImageFill from "@/components/ImageFill";
import SocialPostPreview from "@/components/SocialPostPreview";
import { useAutoSave } from "@/components/useAutoSave";
import { formatDate } from "@/lib/formatDate";
import {
  createSocialPost,
  deleteSocialPost,
  publishSocialPost,
  refreshSocialPost,
  socialMediaForPicks,
  updateSocialPost,
} from "@/lib/actions/socialPosts";
import {
  CAPTION_MAX,
  HASHTAG_MAX,
  SOCIAL_FORMATS,
  SOCIAL_FORMAT_LABEL,
  SOCIAL_STATUSES,
  SOCIAL_STATUS_LABEL,
  countHashtags,
  isEditable,
  socialPostProblem,
  socialPostType,
  type SocialMediaItem,
  type SocialPostFormat,
  type SocialPostRow,
  type SocialPostStatus,
} from "@/lib/socialPosts";

// Marketing → Social Media (2026-10-15): the artist's Instagram posts,
// by status, and the post editor — Post, Reel or Story, its pictures and
// videos (from the Media Catalogue and the artworks), and one caption,
// with a preview of how it will look on Instagram beside it
// English and French together. Changes save themselves. "Post now"
// sends it to the connected Instagram (through Zernio — see
// lib/socialPublishing.ts); a post being posted is checked every
// 15 seconds until it's posted or has failed.

const CHECK_EVERY_MS = 15 * 1000;

type Draft = { format: SocialPostFormat; caption: string; reelInFeed: boolean; imageIds: string[] };

function draftOf(post: SocialPostRow): Draft {
  return {
    format: post.format,
    caption: post.caption,
    reelInFeed: post.reelInFeed,
    imageIds: post.media.map((m) => m.id),
  };
}

function MediaTile({ item }: { item: SocialMediaItem }) {
  return (
    <div className="relative h-full w-full">
      <ImageFill image={{ ...item, displayUrl: item.url }} />
      {item.kind === "VIDEO" && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">▶</span>
      )}
    </div>
  );
}

export default function SocialView({
  siteId,
  artistId,
  initialPosts,
  initialOpenId,
  instagramUsername,
}: {
  siteId: string;
  artistId: string;
  initialPosts: SocialPostRow[];
  // The connected Instagram, or null if none is.
  instagramUsername: string | null;
  // The post to open (kept in the address as ?post=, so Add Media's
  // Upload new comes back to it).
  initialOpenId: string | null;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [tab, setTab] = useState<SocialPostStatus>(
    initialPosts.find((p) => p.id === initialOpenId)?.status ?? "DRAFT"
  );
  const [openId, setOpenId] = useState<string | null>(
    initialPosts.some((p) => p.id === initialOpenId) ? initialOpenId : null
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const open = posts.find((p) => p.id === openId) ?? null;

  const replacePost = (post: SocialPostRow) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));

  // Posts being posted are checked until there's an outcome.
  const postingIds = posts.filter((p) => p.status === "POSTING").map((p) => p.id).join(",");
  useEffect(() => {
    if (!postingIds) return;
    const timer = setInterval(async () => {
      for (const id of postingIds.split(",")) {
        const post = await refreshSocialPost(artistId, id);
        if (post) setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [postingIds, artistId]);

  const { status, begin, schedule, flush } = useAutoSave<Draft>({
    update: (id, draft) => updateSocialPost(artistId, id, draft),
    cannotSave: () => null,
    onSaved: () => {},
  });
  // A post opened on arrival is the one being saved.
  useEffect(() => {
    if (openId) begin(openId);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showInAddress = (id: string | null) =>
    window.history.replaceState(null, "", id ? `?post=${id}` : window.location.pathname);

  // Changes the open post here and saves it.
  const change = (patch: Partial<Omit<SocialPostRow, "id">>) => {
    if (!open) return;
    const next = { ...open, ...patch, updatedAt: new Date().toISOString() };
    setPosts((prev) => prev.map((p) => (p.id === open.id ? next : p)));
    schedule(draftOf(next));
  };

  const openPost = (id: string) => {
    begin(id);
    setOpenId(id);
    setError(null);
    showInAddress(id);
  };

  const closePost = async () => {
    await flush();
    setOpenId(null);
    showInAddress(null);
  };

  const newPost = async () => {
    const post = await createSocialPost(artistId);
    setPosts((prev) => [post, ...prev]);
    setTab("DRAFT");
    openPost(post.id);
  };

  const removePost = async () => {
    if (!open) return;
    const question =
      open.status === "POSTED" ? "Delete this post from here? It stays on Instagram." : "Delete this post?";
    if (!confirm(question)) return;
    const result = await deleteSocialPost(artistId, open.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    begin(null);
    setPosts((prev) => prev.filter((p) => p.id !== open.id));
    setOpenId(null);
    showInAddress(null);
  };

  // A Post adds to its items; a Reel or Story holds one, so a pick
  // replaces it.
  const addPicks = async (imageIds: string[], artworkIds: string[]) => {
    if (!open) return;
    const items = await socialMediaForPicks(artistId, { imageIds, artworkIds });
    change({ media: open.format === "POST" ? [...open.media, ...items] : items.slice(0, 1) });
  };

  const moveItem = (index: number, by: -1 | 1) => {
    if (!open) return;
    const media = open.media.slice();
    const [item] = media.splice(index, 1);
    media.splice(index + by, 0, item);
    change({ media });
  };

  const removeItem = (index: number) => {
    if (!open) return;
    change({ media: open.media.filter((_, i) => i !== index) });
  };

  // Saves anything waiting first, so what's posted is what's shown.
  const postNow = async () => {
    if (!open || !confirm(`Post this to @${instagramUsername} now?`)) return;
    setSending(true);
    setError(null);
    try {
      await flush();
      const result = await publishSocialPost(artistId, open.id);
      if (result.post) replacePost(result.post);
      if ("error" in result) setError(result.error);
    } finally {
      setSending(false);
    }
  };

  if (open) {
    const editable = isEditable(open.status);
    const problem = socialPostProblem(open);
    const hashtags = countHashtags(open.caption);
    return (
      <div className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={closePost}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
            >
              ← Posts
            </button>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${status.isError ? "text-red-600" : "text-neutral-400"}`}>
                {status.text}
              </span>
              <button
                type="button"
                onClick={removePost}
                disabled={open.status === "POSTING"}
                className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">
              {socialPostType(open.format, open.media)}
            </h1>
            <div className="flex overflow-hidden rounded-full border border-neutral-300 text-xs">
              {SOCIAL_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={!editable}
                  onClick={() => change({ format: f })}
                  className={`px-3 py-1 font-medium ${
                    open.format === f ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {SOCIAL_FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            {open.format === "REEL" && (
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={open.reelInFeed}
                  disabled={!editable}
                  onChange={(e) => change({ reelInFeed: e.target.checked })}
                />
                Also show in the main feed
              </label>
            )}
          </div>

          <div className="mb-6">
            <div className="flex flex-wrap gap-3">
              {open.media.map((item, i) => (
                <div key={`${item.id}-${i}`} className="w-32">
                  <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                    <MediaTile item={item} />
                  </div>
                  {item.name && (
                    <p className="mt-1 truncate text-xs text-neutral-600" title={item.name}>
                      {item.name}
                    </p>
                  )}
                  {editable && (
                    <div className="mt-1 flex justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => moveItem(i, -1)}
                        disabled={i === 0}
                        className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                        aria-label="Move earlier"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="px-1 text-neutral-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(i, 1)}
                        disabled={i === open.media.length - 1}
                        className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                        aria-label="Move later"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {editable && (
              <div className="mt-3">
                <MediaPicker
                  artistId={artistId}
                  siteId={siteId}
                  mode={open.format === "POST" ? "multi" : "single"}
                  mediaKinds={open.format === "REEL" ? ["VIDEO"] : ["PHOTO", "VIDEO"]}
                  variant="button"
                  label={open.format !== "POST" && open.media.length > 0 ? "Replace" : "Add Media"}
                  withArtworks={open.format !== "REEL"}
                  onSelect={(images, artworks) =>
                    addPicks(
                      images.map((img) => img.id),
                      artworks.map((a) => a.id)
                    )
                  }
                />
              </div>
            )}
          </div>

          {open.format === "STORY" ? (
            <p className="mb-6 text-sm text-neutral-400">A Story has no caption.</p>
          ) : (
            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-neutral-700">Caption</label>
              <textarea
                value={open.caption}
                onChange={(e) => change({ caption: e.target.value })}
                disabled={!editable}
                rows={10}
                placeholder={"English…\n\nFrançais…\n\n#hashtags"}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <p
                className={`mt-1 text-xs ${
                  open.caption.length > CAPTION_MAX || hashtags > HASHTAG_MAX ? "text-red-600" : "text-neutral-400"
                }`}
              >
                {open.caption.length} / {CAPTION_MAX} characters · {hashtags} / {HASHTAG_MAX} hashtags
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
            {open.status === "POSTING" && (
              <span className="text-sm text-neutral-500">Posting to Instagram — usually within a few minutes…</span>
            )}
            {open.status === "POSTED" && (
              <span className="text-sm text-neutral-500">
                Posted {open.postedAt ? formatDate(open.postedAt) : ""}
                {open.permalink && (
                  <>
                    {" · "}
                    <a href={open.permalink} target="_blank" rel="noreferrer" className="underline hover:text-neutral-900">
                      View on Instagram
                    </a>
                  </>
                )}
              </span>
            )}
            {editable && (
              <>
                <span className={`text-xs ${error || open.error ? "text-red-600" : "text-neutral-400"}`}>
                  {error ??
                    (open.error ? `Posting failed: ${open.error}` : null) ??
                    problem ??
                    (instagramUsername ? `Posts to @${instagramUsername}` : "Connect Instagram in Marketing → Settings first.")}
                </span>
                <button
                  type="button"
                  onClick={postNow}
                  disabled={!!problem || !instagramUsername || sending}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  {sending ? "Sending…" : "Post now"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Preview</p>
          <SocialPostPreview key={open.id} post={open} username={instagramUsername ?? "your_account"} />
          <p className="mt-2 max-w-[320px] text-xs text-neutral-400">
            Instagram may crop pictures slightly differently.
          </p>
        </div>
      </div>
    );
  }

  // A post being posted shows with the posted ones.
  const shown = posts.filter((p) => p.status === tab || (tab === "POSTED" && p.status === "POSTING"));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">Social Media</h1>
        <button
          type="button"
          onClick={newPost}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          New post
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SOCIAL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tab === s
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {SOCIAL_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No posts here.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openPost(p.id)}
              className="block w-full rounded-md border-2 border-transparent p-1 text-left hover:border-neutral-200"
            >
              <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
                {p.media[0] && <MediaTile item={p.media[0]} />}
                {p.media.length > 1 && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    {p.media.length}
                  </span>
                )}
              </div>
              {p.media[0]?.name && (
                <p className="mt-1 truncate text-sm font-medium text-neutral-900">{p.media[0].name}</p>
              )}
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {socialPostType(p.format, p.media)} ·{" "}
                {p.status === "POSTING" ? "Posting…" : formatDate(p.postedAt ?? p.updatedAt)}
              </p>
              <p className="truncate text-sm text-neutral-900">
                {p.caption.split("\n")[0] || <span className="text-neutral-400">No caption</span>}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
