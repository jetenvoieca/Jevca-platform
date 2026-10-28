"use client";

import AddIconButton from "@/components/AddIconButton";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { listImages } from "@/lib/actions/media";
import { listMedia } from "@/lib/actions/mediaCatalogue";
import { listArtworks, type ArtworkListRow } from "@/lib/actions/artworks";
import { mediaListFilters, type MediaTab } from "@/lib/mediaTabs";
import VideoThumb from "@/components/VideoThumb";
import { useClientWords } from "@/components/ClientWordsProvider";

type PickedImage = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
  // The artwork's Name — its one and only name (2026-09-23).
  artwork: { id: string; catalogueName: string } | null;
};

type MediaRow = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string | null;
  kind: string;
  artwork: { id: string; catalogueName: string } | null;
};

// videoOnly stays exactly as it was (used by a curation's Video section) —
// mediaKinds is the new, more general option, for pickers that want both
// kinds together (e.g. a curation work's presentation pictures, which can
// include video).
// When mediaKinds is given it takes over entirely; otherwise videoOnly's
// old true/false logic applies unchanged.
type PickerSource = MediaTab | "media";

const SOURCE_LABEL: Record<Exclude<PickerSource, "artworks">, string> = {
  marketing: "Marketing",
  videos: "Videos",
  media: "Media",
};

function matchesKind(kind: string, videoOnly: boolean, mediaKinds?: ("PHOTO" | "VIDEO")[]): boolean {
  if (mediaKinds) return mediaKinds.includes(kind as "PHOTO" | "VIDEO");
  return videoOnly ? kind === "VIDEO" : kind === "PHOTO";
}

function toPicked(rows: MediaRow[], videoOnly: boolean, mediaKinds?: ("PHOTO" | "VIDEO")[]): PickedImage[] {
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
  previewUrl,
  previewKind = "image",
  previewClassName,
  variant = "tile",
  onClose,
  onSelect,
  withArtworks = false,
  catalogueViews = false,
}: {
  artistId: string;
  // For the "Upload new" link to this site's Hopper.
  siteId: string;
  mode?: "single" | "multi";
  videoOnly?: boolean;
  // Overrides videoOnly when given — lets a picker show both kinds
  // together, e.g. ["PHOTO", "VIDEO"] for an artwork's Related Images.
  mediaKinds?: ("PHOTO" | "VIDEO")[];
  label?: string;
  // When set (2026-08-30), the closed-state trigger renders this actual
  // image, large and uncropped-to-a-tiny-box (object-cover on a real
  // aspect ratio, not letterboxed), rather than the small dashed
  // "+ Add/Change Image" placeholder tile — the image itself becomes the
  // click target to change it, with a crosshair overlay on hover as the
  // "click to change" affordance. Falls back to the placeholder tile
  // when there's nothing to preview yet. Callers that pass this no
  // longer need their own separate <img> + small MediaPicker pairing —
  // this one picker is now both the preview and the trigger.
  previewUrl?: string;
  // "video" renders previewUrl in a muted <video> instead of an <img>
  // (2026-09-04; e.g. a curation's Video section) — pass a poster
  // frame's URL with previewKind="image" if one exists, or the video
  // file itself with previewKind="video" as a fallback when it doesn't.
  previewKind?: "image" | "video";
  // Overrides the default `aspect-[4/3] w-full` box the preview/trigger
  // renders at (2026-09-04) — e.g. `aspect-video` for a video. Also
  // applied to the empty (no previewUrl yet) dashed placeholder, so a
  // not-yet-picked slot sizes the same way an already-picked one would.
  // Callers that don't pass this (Artist profile photo, Artwork main
  // image, etc.) keep the original aspect-[4/3]/aspect-square boxes.
  previewClassName?: string;
  // "button" (2026-10-08, a campaign mail's picture slots): a plain
  // button with `label` instead of the dashed tile, like ArtworkPicker's.
  //
  // "inline" (2026-10-17, Video Edit's Add Media panel): no trigger and no
  // pop-up — the picker itself, open, where it's placed. `onClose` is
  // called by its Close button and after adding.
  //
  // "icon" (2026-10-26, the Profile Catalogue's ⊞ beside its heading): a
  // small borderless ⊞ button, `label` as its tooltip.
  variant?: "tile" | "button" | "inline" | "icon";
  onClose?: () => void;
  // Picked media, and (withArtworks) picked artworks — one call with
  // everything picked.
  onSelect: (images: PickedImage[], artworks: ArtworkListRow[]) => void;
  // (2026-10-15 — campaign mails, the video editor): the picker also
  // offers the artworks — an Artworks | Media switch, starting on
  // Artworks, like the Media Catalogue. Picked artworks come to onSelect
  // as its second list. In multi mode both can be ticked together.
  withArtworks?: boolean;
  // (2026-10-20 — a curation's work Presentation): the Media Catalogue's
  // views without the artworks — Marketing and Videos — so any picture or
  // video in the catalogue can be picked.
  catalogueViews?: boolean;
}) {
  const words = useClientWords();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [selected, setSelected] = useState<PickedImage[]>([]);
  // What the grid shows. With artworks (2026-10-16): the Media
  // Catalogue's own views — Artworks, Marketing, Videos — those
  // holding a kind this picker takes. Otherwise one list, "media".
  const takesPhotos = matchesKind("PHOTO", videoOnly, mediaKinds);
  const takesVideos = matchesKind("VIDEO", videoOnly, mediaKinds);
  const tabbed = withArtworks || catalogueViews;
  const sources: PickerSource[] = tabbed
    ? [
        ...(withArtworks && takesPhotos ? (["artworks"] as const) : []),
        ...(takesPhotos ? (["marketing"] as const) : []),
        ...(takesVideos ? (["videos"] as const) : []),
      ]
    : ["media"];
  const [source, setSource] = useState<PickerSource>(sources[0]);
  const [artworks, setArtworks] = useState<ArtworkListRow[]>([]);
  const [selectedArtworks, setSelectedArtworks] = useState<ArtworkListRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // This picker searches across the whole catalogue rather than paging
  // through it (unlike the Media Catalogue screen itself, which now
  // paginates — 2026-08-08), so it asks for a generously high ceiling
  // rather than the Catalogue's normal page size, to avoid silently
  // hiding results below whatever a user searches for.
  const PICKER_FETCH_LIMIT = 1000;

  const load = (q: string) => {
    startTransition(async () => {
      const results = await listImages(artistId, q || undefined);
      setImages(toPicked(results, videoOnly, mediaKinds));
    });
  };

  const loadArtworks = (q: string) => {
    startTransition(async () => {
      const { rows } = await listArtworks(artistId, { q: q || undefined, limit: PICKER_FETCH_LIMIT });
      setArtworks(rows);
    });
  };

  // One of the Media Catalogue's media views, newest first.
  const loadMediaTab = (q: string, tab: Exclude<MediaTab, "artworks">) => {
    startTransition(async () => {
      const { rows } = await listMedia(artistId, {
        ...mediaListFilters(tab),
        q: q || undefined,
        limit: PICKER_FETCH_LIMIT,
        newestFirst: true,
      });
      setImages(toPicked(rows, videoOnly, mediaKinds));
    });
  };

  const loadSource = (next: PickerSource, q: string) => {
    if (next === "artworks") loadArtworks(q);
    else if (next === "media") load(q);
    else loadMediaTab(q, next);
  };

  // Whichever list is showing.
  const reload = (q: string) => loadSource(source, q);

  const handleSourceChange = (next: PickerSource) => {
    setSource(next);
    loadSource(next, query);
  };

  const handleOpen = () => {
    setOpen(true);
    setSelected([]);
    setSelectedArtworks([]);
    // The views can change with the picker's settings (e.g. a social post
    // switched to Reel takes videos only).
    const start = sources.includes(source) ? source : sources[0];
    setSource(start);
    loadSource(start, query);
  };

  // Debounced search-as-you-type (2026-08-31) — previously fired a full
  // server request (fetching up to PICKER_FETCH_LIMIT rows) on every
  // keystroke, with no visible loading state. Same fix as ArtworkPicker.tsx
  // / CustomerPicker.tsx. Only reacts to `query` changing — handleSourceChange
  // below still reloads immediately on an explicit tab click, and
  // handleOpen's own immediate load() above still runs right away when the
  // picker is first opened.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reload(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handlePick = (img: PickedImage) => {
    if (mode === "single") {
      onSelect([img], []);
      close();
    } else {
      setSelected((prev) => (prev.some((p) => p.id === img.id) ? prev.filter((p) => p.id !== img.id) : [...prev, img]));
    }
  };

  const handlePickArtwork = (artwork: ArtworkListRow) => {
    if (mode === "single") {
      onSelect([], [artwork]);
      close();
    } else {
      setSelectedArtworks((prev) =>
        prev.some((a) => a.id === artwork.id) ? prev.filter((a) => a.id !== artwork.id) : [...prev, artwork],
      );
    }
  };

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const confirmMulti = () => {
    onSelect(selected, selectedArtworks);
    setSelected([]);
    setSelectedArtworks([]);
    close();
  };

  // Inline, the picker is open from the start.
  useEffect(() => {
    if (variant === "inline") handleOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same trigger everywhere an image/video can be added — a blank dashed
  // tile, not a button — so adding media looks and behaves identically
  // across the Artwork Catalogue, Media Catalogue and Curations. See
  // decisions-log.md, 2026-07-31.
  //
  // When a previewUrl is given (2026-08-30), that convention still
  // applies but scaled up: the actual image fills the tile at a real
  // size instead of a small placeholder, with the same dashed-border
  // language shown as a hover overlay rather than the whole tile.
  // The modal opens over the whole screen through a portal (2026-10-08),
  // so it works wherever the picker sits — even inside a moved or scaled
  // box, like a campaign mail's components. The trigger stays in place.
  let trigger: ReactNode;
  if (variant === "icon") {
    trigger = <AddIconButton label={label} onClick={handleOpen} />;
  } else if (variant === "button") {
    trigger = (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        {label}
      </button>
    );
  } else if (previewUrl) {
    trigger = (
      <button
        type="button"
        onClick={handleOpen}
        className={`group relative block w-full overflow-hidden rounded-md ${previewClassName ?? "aspect-[4/3]"}`}
      >
        {previewKind === "video" ? (
          <video src={previewUrl} muted playsInline className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <div className="hidden h-2/3 w-2/3 items-center justify-center border-2 border-dashed border-white group-hover:flex">
            <span className="text-2xl leading-none text-white">+</span>
          </div>
        </div>
      </button>
    );
  } else {
    trigger = (
      <button
        type="button"
        onClick={handleOpen}
        className={`flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 ${
          previewClassName ?? "aspect-square"
        }`}
      >
        + {label}
      </button>
    );
  }

  const panel = (
    <div
      className={`flex w-full overflow-hidden rounded-lg bg-white ${
        variant === "inline" ? "h-[60vh]" : "max-h-[85vh] shadow-xl"
      }`}
    >
      <div className="flex-1 overflow-y-auto p-4 pb-8">
        {/* Visible loading state (2026-08-31) — previously there was no
              indication a search was in flight at all, which is exactly
              what makes a picker feel unresponsive/broken rather than
              just "a bit slow". */}
        {isPending && <p className="pb-3 text-xs text-neutral-400">Searching…</p>}
        {source === "artworks" ? (
          <div className="grid grid-cols-6 gap-3">
            {artworks.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => handlePickArtwork(a)}
                disabled={!a.imageUrl}
                className="text-left disabled:opacity-40"
              >
                <div
                  className={`overflow-hidden rounded-md border-2 ${
                    selectedArtworks.some((s) => s.id === a.id)
                      ? "border-neutral-900"
                      : "border-transparent hover:border-neutral-300"
                  }`}
                >
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="aspect-square w-full bg-neutral-100" />
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-neutral-500" title={a.catalogueName}>
                  {a.catalogueName}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {images.map((img) => {
              const isSelected = selected.some((s) => s.id === img.id);
              return (
                <button key={img.id} type="button" onClick={() => handlePick(img)} className="text-left">
                  <div
                    className={`overflow-hidden rounded-md border-2 ${
                      isSelected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                    }`}
                  >
                    {img.kind === "VIDEO" ? (
                      img.posterUrl ? (
                        <img src={img.posterUrl} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        // Same fallback as the Media Catalogue grid
                        // (MediaCatalogueView.tsx): videos uploaded via the
                        // iPhone Shortcut have no posterUrl at all, so show
                        // the video's own first frame live instead of a
                        // plain placeholder. Previously this picker was the
                        // one place still showing a grey "Video" box —
                        // different code rendering the same data
                        // differently (see decisions-log, 2026-08-16).
                        <VideoThumb src={img.url} className="aspect-square w-full object-cover" />
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
                    <p className="truncate text-xs font-medium text-rose-600" title={img.artwork.catalogueName}>
                      → {img.artwork.catalogueName}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {source === "artworks" && artworks.length === 0 && !isPending && (
          <p className="py-12 text-center text-sm text-neutral-400">No matches.</p>
        )}
        {source !== "artworks" && images.length === 0 && !isPending && (
          <p className="py-12 text-center text-sm text-neutral-400">
            No matches. Try Upload new.
          </p>
        )}
      </div>

      {/* Right-hand control panel — everything lives here now: search,
            the upload button, the selection count, "Add"/"Add
            selected", and Close. Its own independent scroll (separate
            from the grid) means a long list of future controls never
            pushes Close off-screen or forces the grid to shrink. */}
      <div className="flex w-72 flex-shrink-0 flex-col border-l border-neutral-200">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-8">
          {/* Reordered above Search (2026-08-18, direct request) —
                matches the reference layout's tabs-then-search order. */}
          {tabbed && (
            <div className="flex flex-wrap gap-1.5 text-sm">
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSourceChange(s)}
                  className={`rounded-full border px-3 py-1 ${
                    source === s
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {s === "artworks" ? words.items : SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              source === "artworks"
                ? `Search ${words.items.toLowerCase()}…`
                : mediaKinds && mediaKinds.length > 1
                  ? "Search images and videos…"
                  : videoOnly
                    ? "Search videos…"
                    : "Search images…"
            }
            autoFocus
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />

          {/* Upload new (2026-10-15, direct request) — goes to the
                Hopper, where new media comes in and is sorted, and
                comes back here once an item is added to Media (the
                Hopper's returnTo). Unsaved edits are saved on leaving
                (useAutoSave); the newest media shows first here. */}
          {source !== "artworks" && (
            <button
              type="button"
              onClick={() => {
                const here = window.location.pathname + window.location.search;
                router.push(`/sites/${siteId}/hopper?returnTo=${encodeURIComponent(here)}`);
              }}
              className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-center text-sm hover:bg-neutral-50"
            >
              Upload new
            </button>
          )}

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
              <p className="mb-2 text-sm text-neutral-500">{selected.length + selectedArtworks.length} selected</p>
              {selected.length + selectedArtworks.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {selectedArtworks.map((a) => (
                    <div key={`artwork-${a.id}`} className="group relative">
                      <div className="overflow-hidden rounded-md border border-neutral-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.imageUrl ?? ""} alt="" className="aspect-square w-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedArtworks((prev) => prev.filter((p) => p.id !== a.id))}
                        aria-label={`Remove ${a.catalogueName} from selection`}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white shadow hover:bg-neutral-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selected.map((img) => (
                    <div key={img.id} className="group relative">
                      <div className="overflow-hidden rounded-md border border-neutral-200">
                        {img.kind === "VIDEO" ? (
                          img.posterUrl ? (
                            <img src={img.posterUrl} alt="" className="aspect-square w-full object-cover" />
                          ) : (
                            <VideoThumb src={img.url} className="aspect-square w-full object-cover" />
                          )
                        ) : (
                          <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelected((prev) => prev.filter((p) => p.id !== img.id))}
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
              disabled={selected.length + selectedArtworks.length === 0}
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add selected
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === "inline") return panel;

  const modal = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      {/* Centering wrapper (2026-08-18): a real gap top and bottom; if the
          panel is ever taller than the window, the overlay scrolls. The
          panel itself is two columns (2026-08-18): the grid, and every
          control in one right-hand panel, each scrolling on its own. */}
      <div className="mx-auto flex min-h-full max-w-6xl items-center justify-center py-6">{panel}</div>
    </div>
  );

  return (
    <>
      {trigger}
      {open && createPortal(modal, document.body)}
    </>
  );
}
