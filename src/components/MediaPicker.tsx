"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { listImages } from "@/lib/actions/media";
import { listMedia } from "@/lib/actions/mediaCatalogue";
import VideoThumb from "@/components/VideoThumb";

type PickedImage = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
  artwork: { id: string; presentationTitle: string } | null;
};

type MediaRow = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
  artwork: { id: string; presentationTitle: string } | null;
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
      artwork: img.artwork,
    }));
}

export default function MediaPicker({
  artistId,
  siteId,
  mode = "single",
  videoOnly = false,
  mediaKinds,
  label = "Add Image",
  linkedArtworkId,
  onSelect,
}: {
  artistId: string;
  // Needed only for the "Upload new" link, which now points at the
  // Hopper rather than uploading inline (2026-08-17 — see the note by
  // that link below for why).
  siteId: string;
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
  const [, startTransition] = useTransition();

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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      {/* Centering wrapper (2026-08-18) — previously the modal box itself
          used h-full + items-center on the fixed overlay, which could
          leave it flush against the viewport's bottom edge with nothing
          to visually separate it from the page underneath, especially on
          a shorter window. This wrapper gives a real, minimum py-6 gap
          top and bottom in every case: min-h-full still centers the
          panel vertically on a tall viewport, but if the panel is ever
          taller than the space available, the overlay itself scrolls
          (overflow-y-auto above) rather than the panel bleeding past the
          edge. */}
      <div className="mx-auto flex min-h-full max-w-6xl items-center justify-center py-6">
        {/* Two-column layout (2026-08-18, direct request, replaces a
            top-strip/bottom-strip split — search+toggle+Upload/Close lived
            above the grid, selection-count+Add lived below it). Every
            control now lives in one right-hand panel instead, so adding,
            removing, or reordering a control only ever touches this one
            panel — never the grid, and never a second location. Left
            (grid) and right (panel) scroll independently of each other,
            same "two flex siblings, each its own overflow-y-auto" pattern
            already used for the Artwork editor's grid/detail-panel split. */}
        <div className="flex max-h-[85vh] w-full overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex-1 overflow-y-auto p-4 pb-8">
          <div className="grid grid-cols-6 gap-3">
            {images.map((img) => {
              const isSelected = selected.some((s) => s.id === img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handlePick(img)}
                  className="text-left"
                >
                  <div
                    className={`overflow-hidden rounded-md border-2 ${
                      isSelected
                        ? "border-neutral-900"
                        : "border-transparent hover:border-neutral-300"
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
                  </div>
                  {/* Caption/title under each thumbnail (2026-08-17,
                      direct request) — this picker previously showed no
                      text at all, making genuinely similar-looking images
                      (e.g. several close variants of the same piece)
                      indistinguishable without opening each one. Only
                      rendered when there's an actual caption, so an
                      uncaptioned image doesn't leave an odd empty gap
                      that shifts the grid's alignment either way. */}
                  {img.caption && (
                    <p className="mt-1 truncate text-xs text-neutral-500" title={img.caption}>
                      {img.caption}
                    </p>
                  )}
                  {img.artwork && (
                    <p
                      className="truncate text-xs font-medium text-rose-600"
                      title={img.artwork.presentationTitle}
                    >
                      → {img.artwork.presentationTitle}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {images.length === 0 && (
            <p className="py-12 text-center text-sm text-neutral-400">
              {linkedArtworkId && purpose === "related"
                ? "No images related to this artwork yet."
                : "No matches. Upload new images via the Hopper."}
            </p>
          )}
        </div>

        {/* Right-hand control panel — everything lives here now: search,
            the Marketing/Related toggle (when scoped to one artwork),
            the Hopper upload link, the selection count, "Add"/"Add
            selected", and Close. Its own independent scroll (separate
            from the grid) means a long list of future controls never
            pushes Close off-screen or forces the grid to shrink. */}
        <div className="flex w-72 flex-shrink-0 flex-col border-l border-neutral-200">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-8">
            {/* Reordered above Search (2026-08-18, direct request) —
                matches the reference layout's tabs-then-search order. */}
            {linkedArtworkId && (
              // Same pill style as the Media Catalogue's own Marketing/
              // Related toggle, for visual consistency.
              <div className="flex w-fit overflow-hidden rounded-full border border-neutral-300 text-sm">
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
            )}

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
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />

            {/* Still a link to the Hopper, not inline upload — this
                picker stays read-only/browse-only by deliberate decision
                (2026-08-17): every new image goes through the Hopper's
                controlled intake, captioning, and sort step first.
                Reconfirmed 2026-08-18 when this panel was reworked — only
                its position moved, not what it does. */}
            <Link
              href={`/sites/${siteId}/hopper`}
              className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-center text-sm hover:bg-neutral-50"
            >
              Upload new
            </Link>

            {/* Selected items, shown as thumbnails with their own remove
                control (2026-08-18, direct request) — previously this
                was just a count ("N selected"), so once the grid was
                scrolled away from a selected thumbnail, there was no way
                to see which images were actually selected without
                scrolling back to find the highlighted border again. This
                list stays visible in the panel regardless of grid scroll
                position, and doubles as the way to deselect something
                without hunting for it in the grid. */}
            {mode === "multi" && (
              <div>
                <p className="mb-2 text-sm text-neutral-500">
                  {selected.length} selected
                </p>
                {selected.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {selected.map((img) => (
                      <div key={img.id} className="group relative">
                        <div className="overflow-hidden rounded-md border border-neutral-200">
                          {img.kind === "VIDEO" ? (
                            img.posterUrl ? (
                              <img
                                src={img.posterUrl}
                                alt=""
                                className="aspect-square w-full object-cover"
                              />
                            ) : (
                              <VideoThumb
                                src={img.url}
                                className="aspect-square w-full object-cover"
                              />
                            )
                          ) : (
                            <img
                              src={img.url}
                              alt=""
                              className="aspect-square w-full object-cover"
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelected((prev) => prev.filter((p) => p.id !== img.id))
                          }
                          aria-label={`Remove ${img.caption || "image"} from selection`}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white shadow hover:bg-neutral-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-neutral-200 p-4">
            {mode === "multi" && (
              <button
                type="button"
                onClick={confirmMulti}
                disabled={selected.length === 0}
                className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Add selected
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}


