"use client";

import { useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import ImageFill from "@/components/ImageFill";
import { setCurationWorkImages } from "@/lib/actions/curations";
import type { ArtworkImage } from "@/lib/artworkImages";

// A work's images within one curation (2026-10-03): the main image large
// on the left, up to 3 more in a column of squares beside it (2026-10-29,
// Craig's mockup — the main square is exactly the height of the three).
// Everything here
// changes this curation only, never the artwork or the Catalogue — see
// CurationItem.ownImages in schema.prisma.
// - Click one of the 3 smaller images to show "Make main image".
// - Hover a smaller image for ✕ to take it out of this curation. The main
//   image has no ✕ (2026-10-04, direct request) — it's only ever changed
//   by making another image main, so a work always keeps one once it has
//   one. setCurationWorkImages enforces the same rule.
// - "+ Add" picks a picture or video from the Media Catalogue (Marketing
//   or Videos).
export default function CurationImageEditor({
  curationId,
  artworkId,
  artistId,
  siteId,
  images,
  onSaved,
  onError,
}: {
  curationId: string;
  artworkId: string;
  artistId: string;
  siteId: string;
  // Main first.
  images: ArtworkImage[];
  onSaved: (images: ArtworkImage[]) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // The smaller image showing its "Make main image" option, if any.
  const [optionsFor, setOptionsFor] = useState<string | null>(null);

  const ids = images.map((i) => i.id);
  const [main, ...others] = images;

  const save = async (imageIds: string[]) => {
    setOptionsFor(null);
    setBusy(true);
    const result = await setCurationWorkImages(curationId, artistId, artworkId, imageIds);
    setBusy(false);
    if ("error" in result) {
      onError(result.error);
      return;
    }
    onSaved(result.images);
  };

  const makeMain = (id: string) => save([id, ...ids.filter((i) => i !== id)]);
  const remove = (id: string) => save(ids.filter((i) => i !== id));
  const add = (added: { id: string }[]) =>
    save([...ids, ...added.map((a) => a.id).filter((id) => !ids.includes(id))].slice(0, 4));

  const addTile = (key: string, label: string, className = "aspect-square") => (
    <div key={key} className={className}>
      <MediaPicker
        artistId={artistId}
        siteId={siteId}
        mode="single"
        label={label}
        mediaKinds={["PHOTO", "VIDEO"]}
        catalogueViews
        previewClassName="aspect-square h-full w-full"
        onSelect={add}
      />
    </div>
  );

  const removeButton = (id: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        remove(id);
      }}
      disabled={busy}
      title="Remove from this curation"
      className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
    >
      ✕
    </button>
  );

  return (
    // Four columns: the main image spans three columns and three rows, so
    // it's square and level with the three small squares beside it.
    <div className={`grid grid-cols-4 gap-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {main ? (
        <div className="relative col-span-3 row-span-3 overflow-hidden rounded-md bg-neutral-100">
          <ImageFill image={main} large />
          <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white">
            Main
          </span>
        </div>
      ) : (
        addTile("add-main", "Add main image", "col-span-3 row-span-3")
      )}

      {[0, 1, 2].map((i) => {
        const img = others[i];
        if (!img) return addTile(`add-${i}`, "Add");
        return (
          <div
            key={img.id}
            role="button"
            tabIndex={0}
            onClick={() => setOptionsFor((prev) => (prev === img.id ? null : img.id))}
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-md bg-neutral-100"
          >
            <ImageFill image={img} />
            {removeButton(img.id)}
            {optionsFor === img.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    makeMain(img.id);
                  }}
                  className="rounded-md bg-white px-2 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
                >
                  Make main image
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
