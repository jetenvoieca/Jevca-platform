"use client";

import { useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import { PlayMark } from "@/components/SectionMediaView";
import ProfileStoryModal, { type GalleryOption } from "@/components/ProfileStoryModal";
import { createProfileStory, reorderProfileStories, type ProfileStoryRow } from "@/lib/actions/profileStories";

// The Profile Catalogue (2026-10-26, Craig's mockup — a first, basic
// version to try out): a grid of stories, each a picture or video with
// its caption. ⊞ picks pictures or videos from the Media Catalogue (or
// "Upload new", through the Hopper) — one new story each. Drag a tile to
// reorder. Clicking a tile opens its details in a modal, like the
// Artwork Catalogue: the picture (click for full size) or video (plays in
// place), Caption and Story, each saved when the box is left.
//
// The Artist Statement and Biography / CV (2026-11-02, Craig's mockup)
// come first, always there: named by their kind (no Caption box), not
// dragged or deleted; a picture is chosen in their window (an empty box
// until then). Galleries (2026-11-03) also lists galleries — chosen from
// the artist's Locations of type Gallery and put in order in its window
// (ProfileStoryModal, shared with the Artist App's Update CV).

export default function ProfileCatalogueView({
  artistId,
  siteId,
  initialStories,
  galleries,
}: {
  artistId: string;
  siteId: string;
  initialStories: ProfileStoryRow[];
  galleries: GalleryOption[];
}) {
  const [stories, setStories] = useState(initialStories);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const open = stories.find((s) => s.id === openId) ?? null;

  const handleAdd = async (picked: { id: string }[]) => {
    if (picked.length === 0) return;
    setError(null);
    setAdding(true);
    const added: ProfileStoryRow[] = [];
    for (const p of picked) {
      const result = await createProfileStory(artistId, p.id);
      if ("error" in result) setError(result.error);
      else added.push(result);
    }
    setStories((prev) => [...prev, ...added]);
    setAdding(false);
    if (added.length === 1) setOpenId(added[0].id);
  };

  const handleDrop = (target: number) => {
    if (dragIndex === null || dragIndex === target || stories[target].kind !== "STORY") {
      setDragIndex(null);
      return;
    }
    const before = stories;
    const next = [...stories];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    setStories(next);
    setError(null);
    (async () => {
      const result = await reorderProfileStories(
        artistId,
        next.filter((s) => s.kind === "STORY").map((s) => s.id)
      );
      if ("error" in result) {
        setError(result.error);
        setStories(before);
      }
    })();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-4">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">Profile Catalogue</h1>
          <MediaPicker
            artistId={artistId}
            siteId={siteId}
            mode="multi"
            mediaKinds={["PHOTO", "VIDEO"]}
            catalogueViews
            variant="icon"
            label="Add pictures or videos"
            onSelect={(images) => handleAdd(images)}
          />
          {adding && <span className="text-sm text-neutral-400">Adding…</span>}
        </div>
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
        {stories.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No stories yet — click ⊞ to add pictures or videos, then write their stories.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-6">
            {stories.map((s, i) => (
              <button
                key={s.id}
                type="button"
                draggable={s.kind === "STORY"}
                onClick={() => setOpenId(s.id)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", s.id);
                  setDragIndex(i);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(i);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`block w-full cursor-pointer text-left ${dragIndex === i ? "opacity-40" : ""}`}
              >
                <div className="relative">
                  {s.media?.thumbUrl ? (
                    <img
                      src={s.media.thumbUrl}
                      alt=""
                      draggable={false}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  ) : !s.media && s.kind !== "STORY" ? (
                    <div className="aspect-square w-full rounded-md border border-neutral-300" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                      {s.media ? "Video" : "No picture"}
                    </div>
                  )}
                  {s.media?.kind === "VIDEO" && <PlayMark />}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-neutral-900">{s.caption || "Untitled"}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <ProfileStoryModal
          key={open.id}
          story={open}
          artistId={artistId}
          siteId={siteId}
          galleries={galleries}
          onClose={() => setOpenId(null)}
          onSaved={(row) => setStories((prev) => prev.map((s) => (s.id === row.id ? row : s)))}
          onDeleted={() => {
            setStories((prev) => prev.filter((s) => s.id !== open.id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
