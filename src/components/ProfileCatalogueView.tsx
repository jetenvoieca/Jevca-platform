"use client";

import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import SectionMediaView, { PlayMark } from "@/components/SectionMediaView";
import { useBackdropClose } from "@/lib/useBackdropClose";
import {
  createProfileStory,
  deleteProfileStory,
  reorderProfileStories,
  setProfileGalleries,
  setProfileStoryImage,
  updateProfileStory,
  type ProfileStoryRow,
} from "@/lib/actions/profileStories";

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
// the artist's Locations of type Gallery and put in order in its window.

// A Location of type Gallery, to choose for the Galleries entry.
type GalleryOption = { id: string; name: string };
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
        <StoryModal
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

function StoryModal({
  story,
  artistId,
  siteId,
  galleries,
  onClose,
  onSaved,
  onDeleted,
}: {
  story: ProfileStoryRow;
  artistId: string;
  siteId: string;
  galleries: GalleryOption[];
  onClose: () => void;
  onSaved: (row: ProfileStoryRow) => void;
  onDeleted: () => void;
}) {
  const [caption, setCaption] = useState(story.caption);
  const [text, setText] = useState(story.story);
  const [fullSize, setFullSize] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaving the box being edited first, so its change is saved.
  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };
  const backdrop = useBackdropClose(close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fullSize) setFullSize(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSize]);

  const save = async (fields: { caption?: string; story?: string }) => {
    const unchanged =
      (fields.caption ?? story.caption).trim() === story.caption && (fields.story ?? story.story).trim() === story.story;
    if (unchanged) return;
    setError(null);
    const result = await updateProfileStory(story.id, artistId, fields);
    if ("error" in result) setError(result.error);
    else onSaved(result);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the story "${story.caption || "Untitled"}"? Its picture or video stays in the Media Catalogue.`)) {
      return;
    }
    await deleteProfileStory(story.id, artistId);
    onDeleted();
  };

  const media = story.media;
  // The Artist Statement or Biography / CV.
  const fixed = story.kind !== "STORY";

  // Choose (or change) its picture or video (2026-10-27).
  const pickMedia = async (imageId: string) => {
    setError(null);
    const result = await setProfileStoryImage(story.id, artistId, imageId);
    if ("error" in result) setError(result.error);
    else onSaved(result);
  };
  const picker = (label: string) => (
    <MediaPicker
      artistId={artistId}
      siteId={siteId}
      mode="single"
      mediaKinds={["PHOTO", "VIDEO"]}
      catalogueViews
      variant="button"
      label={label}
      onSelect={(images) => {
        if (images[0]) pickMedia(images[0].id);
      }}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold text-neutral-900">
            {caption.trim() || "Untitled"}
          </h2>
          {fixed ? null : (
            <button
              type="button"
              onClick={handleDelete}
              className="shrink-0 rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {!media && fixed ? (
          <div className="mb-4">{picker(story.kind === "STATEMENT" ? "Add a picture" : "Add a picture (optional)")}</div>
        ) : !media ? (
          <div className="mb-4 flex aspect-[4/3] w-1/2 flex-col items-center justify-center gap-3 rounded-md bg-neutral-100 p-3 text-center text-sm text-neutral-400">
            <span>Its picture or video was deleted from the Media Catalogue.</span>
            {picker("Choose a picture or video")}
          </div>
        ) : media.kind === "VIDEO" ? (
          <>
            <div className="w-1/2 overflow-hidden rounded-md">
              <SectionMediaView media={{ kind: "VIDEO", url: media.fullUrl, posterUrl: media.displayUrl }} />
            </div>
            <p className="mb-4 mt-1 text-xs text-neutral-400">Click to play, right here.</p>
          </>
        ) : (
          <>
            <img
              src={media.displayUrl ?? media.fullUrl}
              alt=""
              onClick={() => setFullSize(true)}
              className="w-1/2 cursor-zoom-in rounded-md object-cover"
            />
            <p className="mb-4 mt-1 text-xs text-neutral-400">Click to view full size.</p>
          </>
        )}

        {media && <div className="mb-4">{picker("Change picture or video")}</div>}

        {!fixed && (
          <>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Caption</label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => save({ caption })}
              className="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </>
        )}

        <label className="mb-1 block text-sm font-medium text-neutral-700">
          {story.kind === "GALLERIES" ? "Text (optional)" : fixed ? "Text" : "Story"}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => save({ story: text })}
          rows={story.kind === "GALLERIES" ? 4 : 14}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm leading-relaxed"
        />

        {story.kind === "GALLERIES" && (
          <GalleriesList
            siteId={siteId}
            chosen={story.galleries.map((g) => ({ id: g.locationId, name: g.name }))}
            options={galleries}
            onChange={async (ids) => {
              setError(null);
              const result = await setProfileGalleries(story.id, artistId, ids);
              if ("error" in result) setError(result.error);
              else onSaved(result);
            }}
          />
        )}
      </div>

      {fullSize && media && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-8"
          onClick={() => setFullSize(false)}
        >
          <img
            src={media.fullUrl}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setFullSize(false)}
            className="absolute right-6 top-6 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Close ✕
          </button>
        </div>
      )}
    </div>
  );
}

// The Galleries entry's galleries (2026-11-03): the chosen ones in order
// — drag one onto another to move it, ✕ to take it off — and a list of
// the artist's other galleries to add one. Each change saves at once.
function GalleriesList({
  siteId,
  chosen,
  options,
  onChange,
}: {
  siteId: string;
  chosen: GalleryOption[];
  options: GalleryOption[];
  onChange: (ids: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const ids = chosen.map((g) => g.id);
  const others = options.filter((o) => !ids.includes(o.id));

  const drop = (target: number) => {
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null);
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    onChange(next);
  };

  return (
    <div className="mt-4">
      <p className="mb-1 text-sm font-medium text-neutral-700">Galleries</p>
      {chosen.length === 0 ? (
        <p className="mb-2 text-sm text-neutral-400">None yet — add them below.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1.5">
          {chosen.map((g, i) => (
            <li
              key={g.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", g.id);
                setDragIndex(i);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                drop(i);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex cursor-grab items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 active:cursor-grabbing ${
                dragIndex === i ? "opacity-40" : ""
              }`}
            >
              <span className="text-neutral-400" aria-hidden>
                ⠿
              </span>
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <button
                type="button"
                onClick={() => onChange(ids.filter((id) => id !== g.id))}
                aria-label={`Take ${g.name} off`}
                title="Take off the list"
                className="text-neutral-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length === 0 ? (
        <p className="text-xs text-neutral-400">No galleries yet — add them in Locations, with the type Gallery.</p>
      ) : (
        others.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...ids, e.target.value]);
            }}
            aria-label="Add a gallery"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-700"
          >
            <option value="">Add a gallery…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )
      )}
      <p className="mt-1 text-xs text-neutral-400">
        {/* Where those are set, linked (2026-11-08 — "contact card" didn't
            say where). */}
        Each shows its name, town and website — set those in{" "}
        <a href={`/sites/${siteId}/galleries`} target="_blank" rel="noopener noreferrer" className="underline">
          Locations
        </a>{" "}
        (click the gallery).
      </p>
    </div>
  );
}
