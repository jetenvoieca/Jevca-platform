"use client";

import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import SectionMediaView from "@/components/SectionMediaView";
import { useBackdropClose } from "@/lib/useBackdropClose";
import {
  deleteProfileStory,
  setProfileGalleries,
  setProfileStoryImage,
  updateProfileStory,
  type ProfileStoryRow,
} from "@/lib/actions/profileStories";

// A Profile Catalogue entry's window (2026-10-26; moved here 2026-11-08
// to be shared by the Profile Catalogue and the Artist App's Pages):
// its picture (click for full size) or video (plays in place), Caption
// and Story, each saved when the box is left; Delete for a story. The
// picture is optional — Remove picture leaves it text only. The
// Artist Statement, Biography / CV and Galleries have no Caption box and
// can't be deleted; Galleries also lists its galleries.

// A Location of type Gallery, to choose for the Galleries entry.
export type GalleryOption = { id: string; name: string };

export default function ProfileStoryModal({
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

  // Choose, change (2026-10-27) or remove (2026-11-09) its picture or
  // video — any entry can be text only.
  const pickMedia = async (imageId: string | null) => {
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

        {!media ? (
          <div className="mb-4">{picker("Add a picture or video (optional)")}</div>
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

        {media && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {picker("Change picture or video")}
            <button
              type="button"
              onClick={() => pickMedia(null)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Remove picture
            </button>
          </div>
        )}

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
// Also Administration → Concierge's "Update my list of Galleries"
// (2026-11-13), where the site may not be known (no Locations link).
export function GalleriesList({
  siteId,
  chosen,
  options,
  onChange,
}: {
  siteId: string | null;
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
      {siteId && (
        <p className="mt-1 text-xs text-neutral-400">
          {/* Where those are set, linked (2026-11-08 — "contact card" didn't
              say where). */}
          Each shows its name, town and website — set those in{" "}
          <a href={`/sites/${siteId}/galleries`} target="_blank" rel="noopener noreferrer" className="underline">
            Locations
          </a>{" "}
          (click the gallery).
        </p>
      )}
    </div>
  );
}
