"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import MediaPicker from "@/components/MediaPicker";
import ImageFill from "@/components/ImageFill";
import { moveItem, useArrangeItem, useArrangeReorder, type ItemDragData } from "@/components/arrangeItemDrag";
import type { ArtworkImage } from "@/lib/artworkImages";
import { uploadPicture } from "@/lib/pictureUpload";

// A main picture and up to 3 more (2026-10-03, a work's images within a
// curation; shared 2026-11-02 with an Exhibition's pictures): the main
// image large on top, the others in a row of squares under it
// (2026-11-02, Craig's mockup — the main square is exactly the width of
// the three). `save` stores the new list (main first) and returns it as
// saved — e.g. a curation's own images, never the artwork's (see
// CurationItem.ownImages in schema.prisma).
// - Drag an image onto another to change the order (2026-10-29, Craig's
//   request) — dropped on the main image, it becomes the main image. The
//   same dragging as a page's Arrange (arrangeItemDrag.ts).
// - Hover a smaller image for ✕ to take it out. The main image has no ✕
//   (2026-10-04, direct request) — it's only ever changed by making
//   another image main, so once there is one there always is.
// - "+ Add" picks a picture or video from the Media Catalogue (Marketing
//   or Videos) — or, with `addFrom="file"` (2026-11-09, the Artist App's
//   Portfolio level), chooses a picture file from the device, uploaded
//   straight in (lib/pictureUpload.ts).

// The drag list's name, as a page's component id is in Arrange.
const LIST_ID = "image-set";

type SaveImages = (imageIds: string[]) => Promise<{ images: ArtworkImage[] } | { error: string }>;

function thumbUrl(img: ArtworkImage): string | null {
  return img.kind === "VIDEO" ? img.posterUrl : img.url;
}

export default function ImageSetEditor(props: {
  artistId: string;
  siteId: string;
  // Main first.
  images: ArtworkImage[];
  save: SaveImages;
  onSaved: (images: ArtworkImage[]) => void;
  onError: (message: string) => void;
  addFrom?: "catalogue" | "file";
}) {
  const [dragging, setDragging] = useState<ItemDragData | null>(null);
  // Moving the pointer a little first, so a click on ✕ isn't a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as ItemDragData | undefined) ?? null)}
      onDragEnd={() => setDragging(null)}
      onDragCancel={() => setDragging(null)}
    >
      <ImageGrid {...props} dragging={dragging} />
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="h-20 w-20 overflow-hidden rounded-md shadow-md">
            {dragging.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dragging.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-neutral-200" />
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function ImageGrid({
  artistId,
  siteId,
  images,
  save: store,
  onSaved,
  onError,
  addFrom = "catalogue",
  dragging,
}: {
  artistId: string;
  siteId: string;
  images: ArtworkImage[];
  save: SaveImages;
  onSaved: (images: ArtworkImage[]) => void;
  onError: (message: string) => void;
  addFrom?: "catalogue" | "file";
  dragging: ItemDragData | null;
}) {
  const [busy, setBusy] = useState(false);
  const ids = images.map((i) => i.id);
  const [main, ...others] = images;

  const save = async (imageIds: string[]) => {
    setBusy(true);
    const result = await store(imageIds);
    setBusy(false);
    if ("error" in result) {
      onError(result.error);
      return;
    }
    onSaved(result.images);
  };

  useArrangeReorder(LIST_ID, (fromId, toId) => {
    const next = moveItem(ids, (id) => id, fromId, toId);
    if (next) save(next);
  });

  const remove = (id: string) => save(ids.filter((i) => i !== id));
  const add = (added: { id: string }[]) =>
    save([...ids, ...added.map((a) => a.id).filter((id) => !ids.includes(id))].slice(0, 4));

  // The square a chosen file is going into, while it uploads and is
  // saved — it says so there (Craig, 9 Nov: there's a short wait).
  const [fetching, setFetching] = useState<string | null>(null);
  const addFile = async (tile: string, file: File) => {
    setFetching(tile);
    setBusy(true);
    const result = await uploadPicture(artistId, file).catch(() => ({ error: "Upload failed — please try again." }));
    setBusy(false);
    if ("error" in result) {
      setFetching(null);
      return onError(result.error);
    }
    await add([{ id: result.imageId }]);
    setFetching(null);
  };

  const addTile = (key: string, label: string, className = "aspect-square") => (
    <div key={key} className={className}>
      {addFrom === "file" ? (
        <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600">
          {fetching === key ? <span className="text-neutral-500">Fetching image…</span> : `+ ${label}`}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) addFile(key, file);
            }}
          />
        </label>
      ) : (
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
      )}
    </div>
  );

  return (
    // Three columns: the main image spans all three, square, with the
    // three small squares in a row under it.
    <div className={`grid grid-cols-3 gap-2.5 ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {main ? (
        <ImageTile image={main} dragging={dragging} className="col-span-3 aspect-square" large>
          <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white">
            Main
          </span>
        </ImageTile>
      ) : (
        addTile("add-main", "Add main image", "col-span-3 aspect-square")
      )}

      {[0, 1, 2].map((i) => {
        const img = others[i];
        if (!img) return addTile(`add-${i}`, "Add");
        return (
          <ImageTile key={img.id} image={img} dragging={dragging} className="aspect-square">
            <button
              type="button"
              onClick={() => remove(img.id)}
              disabled={busy}
              title="Remove"
              className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
            >
              ✕
            </button>
          </ImageTile>
        );
      })}
    </div>
  );
}

// One image: dragged by itself, and a place to drop another.
function ImageTile({
  image,
  dragging,
  className,
  large,
  children,
}: {
  image: ArtworkImage;
  dragging: ItemDragData | null;
  className: string;
  large?: boolean;
  children: ReactNode;
}) {
  const drag = useArrangeItem(LIST_ID, image.id, thumbUrl(image), dragging);
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      title="Drag onto another image to change the order — onto the main image to make it the main image"
      className={`group relative cursor-grab touch-none overflow-hidden rounded-md bg-neutral-100 ${className} ${
        drag.isDragging ? "opacity-30" : ""
      } ${drag.target ? "ring-4 ring-blue-500" : ""}`}
    >
      <ImageFill image={image} large={large} />
      {children}
    </div>
  );
}
