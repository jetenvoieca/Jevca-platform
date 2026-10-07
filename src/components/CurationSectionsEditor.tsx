"use client";

import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import {
  addCurationSection,
  deleteCurationSection,
  listCurationSections,
  reorderCurationSections,
  setCurationSectionMedia,
  updateCurationSectionText,
} from "@/lib/actions/curationSections";
import {
  CURATION_SECTION_TYPES,
  MAX_SECTION_HEADING,
  MAX_SECTION_IMAGES,
  MAX_SECTION_TEXT,
  curationSectionLabel,
  isTextSection,
  type CurationSectionData,
  type CurationSectionType,
} from "@/lib/curationSections";

// The Curations page's presentation sections (2026-10-06, from Craig's
// mockups) — what the curation panel on a page shows under the artwork:
// Tag line, Description, Video, Free text and Images, any number of
// each, in any order. Each section is its own box: text saves when the
// box is left, a video or images save as soon as they're picked. ↑ ↓
// reorder, ✕ deletes. "+ Add section" adds one at the end. Text
// sections are plain text (2026-10-07). Loaded for one curation; the
// Curations page remounts it (key) when another is opened.
export default function CurationSectionsEditor({
  curationId,
  artistId,
  siteId,
}: {
  curationId: string;
  artistId: string;
  siteId: string;
}) {
  const [sections, setSections] = useState<CurationSectionData[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listCurationSections(curationId, artistId).then((rows) => setSections(rows));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId, artistId]);

  const replace = (next: CurationSectionData) =>
    setSections((prev) => prev?.map((s) => (s.id === next.id ? next : s)) ?? prev);

  const add = async (type: CurationSectionType) => {
    setAdding(false);
    setError(null);
    const result = await addCurationSection(curationId, artistId, type);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSections((prev) => [...(prev ?? []), result]);
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!sections) return;
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    setError(null);
    const result = await reorderCurationSections(
      curationId,
      artistId,
      next.map((s) => s.id)
    );
    if ("error" in result) {
      setError(result.error);
      load();
    }
  };

  const remove = async (section: CurationSectionData) => {
    if (!confirm(`Delete this ${curationSectionLabel(section.type)} section?`)) return;
    setError(null);
    setSections((prev) => prev?.filter((s) => s.id !== section.id) ?? prev);
    await deleteCurationSection(section.id, artistId);
  };

  if (sections === null) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {sections.length === 0 && (
        <p className="text-center text-sm text-neutral-400">
          No presentation sections yet — add a tag line, description, video and more.
        </p>
      )}

      {sections.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-neutral-300 p-3">
          <div className="mb-2 flex items-center gap-1">
            <h3 className="flex-1 text-center text-base text-neutral-900">
              {curationSectionLabel(s.type)}
            </h3>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
              className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === sections.length - 1}
              aria-label="Move down"
              className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(s)}
              aria-label="Delete section"
              className="px-1 text-xs text-neutral-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
          <SectionBody
            section={s}
            artistId={artistId}
            siteId={siteId}
            onSaved={replace}
            onError={setError}
          />
        </div>
      ))}

      {adding ? (
        <div className="grid grid-cols-2 gap-1.5 rounded-md border border-neutral-200 p-2">
          {CURATION_SECTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => add(t.value)}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              + {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md border border-dashed border-neutral-400 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          + Add section
        </button>
      )}
    </div>
  );
}

// One section's own fields, by type.
function SectionBody({
  section,
  artistId,
  siteId,
  onSaved,
  onError,
}: {
  section: CurationSectionData;
  artistId: string;
  siteId: string;
  onSaved: (section: CurationSectionData) => void;
  onError: (error: string | null) => void;
}) {
  const [heading, setHeading] = useState(section.heading ?? "");
  const [text, setText] = useState(section.text ?? "");

  const saveText = async (field: "heading" | "text", value: string) => {
    const current = (field === "heading" ? section.heading : section.text) ?? "";
    if (value.trim() === current) return;
    onError(null);
    const result = await updateCurationSectionText(
      section.id,
      artistId,
      field === "heading" ? { heading: value } : { text: value }
    );
    if ("error" in result) {
      onError(result.error);
      return;
    }
    onSaved({ ...section, ...result });
    setHeading(result.heading ?? "");
    setText(result.text ?? "");
  };

  const saveMedia = async (imageIds: string[]) => {
    onError(null);
    const result = await setCurationSectionMedia(section.id, artistId, imageIds);
    if ("error" in result) {
      onError(result.error);
      return;
    }
    onSaved({ ...section, media: result.media });
  };

  const fieldClass =
    "w-full rounded-md border border-transparent bg-transparent p-1 text-sm text-neutral-800 hover:border-neutral-300 focus:border-neutral-400 focus:outline-none";

  if (isTextSection(section.type)) {
    if (section.type === "TAGLINE") {
      return (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => saveText("text", text)}
          maxLength={MAX_SECTION_HEADING}
          placeholder="Write a tag line…"
          className={`${fieldClass} text-center`}
        />
      );
    }
    if (section.type === "DESCRIPTION") {
      return (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => saveText("text", text)}
          maxLength={MAX_SECTION_TEXT}
          rows={6}
          placeholder="Write a description…"
          className={`${fieldClass} resize-y`}
        />
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          onBlur={() => saveText("heading", heading)}
          maxLength={MAX_SECTION_HEADING}
          placeholder="Heading"
          className={`${fieldClass} font-medium`}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => saveText("text", text)}
          maxLength={MAX_SECTION_TEXT}
          rows={5}
          placeholder="Text…"
          className={`${fieldClass} resize-y`}
        />
      </div>
    );
  }

  if (section.type === "VIDEO") {
    const video = section.media[0];
    return (
      <div className="flex flex-col gap-1">
        <MediaPicker
          artistId={artistId}
          siteId={siteId}
          videoOnly
          label="Choose video"
          previewUrl={video ? (video.posterUrl ?? video.url) : undefined}
          previewKind={video && !video.posterUrl ? "video" : "image"}
          previewClassName="aspect-video"
          onSelect={(picked) => picked[0] && saveMedia([picked[0].id])}
        />
        {video && (
          <button
            type="button"
            onClick={() => saveMedia([])}
            className="self-end text-xs text-red-500 hover:underline"
          >
            Remove video
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {section.media.map((m) => (
        <div key={m.imageId} className="group relative">
          <img src={m.url} alt="" className="aspect-square w-full rounded-md object-cover" />
          <button
            type="button"
            onClick={() =>
              saveMedia(section.media.filter((x) => x.imageId !== m.imageId).map((x) => x.imageId))
            }
            aria-label="Remove image"
            className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
          >
            ✕
          </button>
        </div>
      ))}
      {section.media.length < MAX_SECTION_IMAGES && (
        <MediaPicker
          artistId={artistId}
          siteId={siteId}
          mode="multi"
          label="Add images"
          previewClassName="aspect-square"
          onSelect={(picked) =>
            saveMedia([...section.media.map((m) => m.imageId), ...picked.map((p) => p.id)])
          }
        />
      )}
    </div>
  );
}
