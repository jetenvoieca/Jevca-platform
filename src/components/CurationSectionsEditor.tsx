"use client";

import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import {
  listCurationSections,
  setCurationSectionMedia,
  updateCurationSectionText,
} from "@/lib/actions/curationSections";
import {
  MAX_SECTION_IMAGES,
  MAX_SECTION_TEXT,
  curationSectionLabel,
  type CurationSectionData,
} from "@/lib/curationSections";

// The Curations page's presentation sections (2026-10-06; fixed
// 2026-10-13, Craig's mockup) — what the curation panel on a page shows
// under the artwork. Always the same three boxes, in this order:
// Description, Video and Supporting Images. They can't be added,
// removed or reordered; further layout is done in Pages. Text saves when
// the box is left, a video or images save as soon as they're picked —
// from the Media Catalogue's views (2026-10-25, Craig's request, so
// marketing media can go into story pages): Marketing, Videos and
// Related, searchable, not only the newest pictures.
// Loaded for one curation; the Curations page remounts it (key) when
// another is opened.
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCurationSections(curationId, artistId).then(setSections);
  }, [curationId, artistId]);

  const replace = (next: CurationSectionData) =>
    setSections((prev) => prev?.map((s) => (s.id === next.id ? next : s)) ?? prev);

  if (sections === null) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {sections.map((s) => (
        <div key={s.id} className="rounded-xl border border-neutral-300 p-3">
          <h3 className="mb-2 text-center text-base text-neutral-900">
            {curationSectionLabel(s.type)}
          </h3>
          <SectionBody
            section={s}
            artistId={artistId}
            siteId={siteId}
            onSaved={replace}
            onError={setError}
          />
        </div>
      ))}
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
  const [text, setText] = useState(section.text ?? "");

  const saveText = async () => {
    if (text.trim() === (section.text ?? "")) return;
    onError(null);
    const result = await updateCurationSectionText(section.id, artistId, text);
    if ("error" in result) {
      onError(result.error);
      return;
    }
    onSaved({ ...section, text: result.text });
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

  if (section.type === "DESCRIPTION") {
    return (
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={saveText}
        maxLength={MAX_SECTION_TEXT}
        rows={8}
        placeholder="Write a description…"
        className="w-full resize-y rounded-md border border-transparent bg-transparent p-1 text-sm text-neutral-800 hover:border-neutral-300 focus:border-neutral-400 focus:outline-none"
      />
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
          catalogueViews
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
          catalogueViews
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
