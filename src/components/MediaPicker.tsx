"use client";

import { useState, useTransition, useRef } from "react";
import { listImages } from "@/lib/actions/media";
import { listMedia } from "@/lib/actions/mediaCatalogue";
import { uploadFileDirect } from "@/lib/uploadDirect";
import VideoThumb from "@/components/VideoThumb";

type PickedImage = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
};

type MediaRow = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
};

// videoOnly stays exactly as it was (used by the Video content block) —
// mediaKinds is the new, more general option, for pickers that want both
// kinds together (e.g. an artwork's Related Images, since ancillary media
// was always meant to include video — see the original Hopper spec).
// When mediaKinds is given it takes over entirely; otherwise videoOnly's
// old true/false logic applies unchanged.
function matchesKind(kind: string, videoOnly: boolean, mediaKinds?: ("PHOTO" | "VIDEO")[]): boolean {
  if (mediaKinds) return mediaKinds.includes(kind as "PHOTO" | "VIDEO");
  return videoOnly ? kind === "VIDEO" : kind === "PHOTO";
}

function toPicked(
  rows: MediaRow[],
  videoOnly: boolean,
  mediaKinds?: ("PHOTO" | "VIDEO")[]
): PickedImage[] {
  return rows
    .filter((img) => matchesKind(img.kind, videoOnly, mediaKinds))
    .map((img) => ({
      id: img.id,
      url: img.url,
      posterUrl: img.posterUrl,
      caption: img.caption,
      kind: img.kind,
    }));
}

export default function MediaPicker({
  artistId,
  mode = "single",
  videoOnly = false,
  mediaKinds,
  label = "Add Image",
  linkedArtworkId,
  onSelect,
}: {
  artistId: string;
  mode?: "single" | "multi";
  videoOnly?: boolean;
  // Overrides videoOnly when given — lets a picker show both kinds
  // together, e.g. ["PHOTO", "VIDEO"] for an artwork's Related Images.
  mediaKinds?: ("PHOTO" | "VIDEO")[];
  label?: string;
  // When set, this picker is being used to add images to one specific
  // artwork (the Artwork editor's own Images section) — shows the same
  // Marketing/Related toggle as the Media Catalogue, with "Related"
  // scoped strictly to this one artwork's own images, never any other
  // artwork's, so you can never accidentally pick something already
  // belonging to a different piece. Terminology settled on "Related",
  // replacing "ancillary"/"secondary"/"connected" — see decisions-log,
  // 2026-08-05.
  linkedArtworkId?: string;
  onSelect: (images: PickedImage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState<"marketing" | "related">("marketing");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [relatedCount, setRelatedCount] = useState(0);
  const [selected, setSelected] = useState<PickedImage[]>([]);
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // This picker searches across the whole catalogue rather than paging
  // through it (unlike the Media Catalogue screen itself, which now
  // paginates — 2026-08-08), so it asks for a generously high ceiling
  // rather than the Catalogue's normal page size, to avoid silently
  // hiding results below whatever a user searches for.
  const PICKER_FETCH_LIMIT = 1000;

  const load = (q: string, p: "marketing" | "related") => {
    startTransition(async () => {
      if (linkedArtworkId) {
        const { rows } = await listMedia(artistId, {
          purpose: p,
          q: q || undefined,
          artworkId: p === "related" ? linkedArtworkId : undefined,
          limit: PICKER_FETCH_LIMIT,
        });
        setImages(toPicked(rows, videoOnly, mediaKinds));
        if (p === "related") setRelatedCount(rows.length);
      } else {
        const results = await listImages(artistId, q || undefined);
        setImages(toPicked(results, videoOnly, mediaKinds));
      }
    });
  };

  const handleOpen = () => {
    setOpen(true);
    setSelected([]);
    load(query, purpose);
    // Fetch the Related count up front too, so the tab badge is correct
    // even before switching to it — otherwise it'd read "Related (0)"
    // until clicked once.
    if (linkedArtworkId && purpose !== "related") {
      startTransition(async () => {
        const { rows } = await listMedia(artistId, {
          purpose: "related",
          artworkId: linkedArtworkId,
          limit: PICKER_FETCH_LIMIT,
        });
        setRelatedCount(rows.length);
      });
    }
  };

  const handlePurposeChange = (p: "marketing" | "related") => {
    setPurpose(p);
    load(query, p);
  };

  const handleUpload = (file: File) => {
    setUploadError(null);
    startTransition(async () => {
      try {
        const image = await uploadFileDirect(file, artistId);
        const img = {
          id: image.id,
          url: image.url,
          posterUrl: image.posterUrl,
          caption: image.caption,
          kind: image.kind,
        };
        setImages((prev) => [...prev, img]);
        handlePick(img);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed. Try again.");
      }
    });
  };

  const handlePick = (img: PickedImage) => {
    if (mode === "single") {
      onSelect([img]);
      setOpen(false);
    } else {
      setSelected((prev) =>
        prev.some((p) => p.id === img.id)
          ? prev.filter((p) => p.id !== img.id)
          : [...prev, img]
      );
    }
  };

  const confirmMulti = () => {
    onSelect(selected);
    setSelected([]);
    setOpen(false);
  };

  // Same trigger everywhere an image/video can be added — a blank dashed
  // tile, not a button — so adding media looks and behaves identically
  // across the Artwork Catalogue, Media Catalogue, page Content Blocks,
  // and Section artwork grids. See decisions-log.md, 2026-07-31.
  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + {label}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              load(e.target.value, purpose);
            }}
            placeholder={
              mediaKinds && mediaKinds.length > 1
                ? "Search images and videos…"
                : videoOnly
                  ? "Search videos…"
                  : "Search images…"
            }
            autoFocus
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            {isPending ? "Uploading…" : "Upload new"}
            <input
              ref={fileInputRef}
              type="file"
              accept={
                mediaKinds && mediaKinds.length > 1
                  ? "image/*,video/*"
                  : videoOnly
                    ? "video/*"
                    : "image/*"
              }
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {linkedArtworkId && (
          <div className="border-b border-neutral-200 p-4 pt-0">
            {/* Same pill style as the Media Catalogue's own Marketing/
                Related toggle, for visual consistency. */}
            <div className="mt-3 flex w-fit overflow-hidden rounded-full border border-neutral-300 text-sm">
              <button
                type="button"
                onClick={() => handlePurposeChange("marketing")}
                className={`px-4 py-1.5 ${
                  purpose === "marketing" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                }`}
              >
                Marketing
              </button>
              <button
                type="button"
                onClick={() => handlePurposeChange("related")}
                className={`px-4 py-1.5 font-medium ${
                  purpose === "related"
                    ? "bg-neutral-900 text-white"
                    : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                }`}
              >
                Related ({relatedCount})
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <p className="border-b border-neutral-200 bg-red-50 px-4 py-2 text-xs text-red-600">
            {uploadError}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 gap-3">
            {images.map((img) => {
              const isSelected = selected.some((s) => s.id === img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handlePick(img)}
                  className={`overflow-hidden rounded-md border-2 ${
                    isSelected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                  }`}
                >
                  {img.kind === "VIDEO" ? (
                    img.posterUrl ? (
                      <img
                        src={img.posterUrl}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      // Same fallback as the Media Catalogue grid
                      // (MediaCatalogueView.tsx): videos uploaded via the
                      // iPhone Shortcut have no posterUrl at all, so show
                      // the video's own first frame live instead of a
                      // plain placeholder. Previously this picker was the
                      // one place still showing a grey "Video" box —
                      // different code rendering the same data
                      // differently (see decisions-log, 2026-08-16).
                      <VideoThumb
                        src={img.url}
                        className="aspect-square w-full object-cover"
                      />
                    )
                  ) : (
                    <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
          {images.length === 0 && (
            <p className="py-12 text-center text-sm text-neutral-400">
              {linkedArtworkId && purpose === "related"
                ? "No images related to this artwork yet."
                : "No matches. Upload one above."}
            </p>
          )}
        </div>

        {mode === "multi" && (
          <div className="flex items-center justify-between border-t border-neutral-200 p-4">
            <span className="text-sm text-neutral-500">{selected.length} selected</span>
            <button
              type="button"
              onClick={confirmMulti}
              disabled={selected.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
