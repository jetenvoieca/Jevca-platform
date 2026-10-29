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
import { setCurationWorkImages } from "@/lib/actions/curations";
import type { ArtworkImage } from "@/lib/artworkImages";

// A work's images within one curation (2026-10-03): the main image large
// on the left, up to 3 more in a column of squares beside it (2026-10-29,
// Craig's mockup — the main square is exactly the height of the three).
// Everything here changes this curation only, never the artwork or the
// Catalogue — see CurationItem.ownImages in schema.prisma.
// - Drag an image onto another to change the order (2026-10-29, Craig's
//   request) — dropped on the main image, it becomes the main image. The
//   same dragging as a page's Arrange (arrangeItemDrag.ts).
// - Hover a smaller image for ✕ to take it out of this curation. The main
//   image has no ✕ (2026-10-04, direct request) — it's only ever changed
//   by making another image main, so a work always keeps one once it has
//   one. setCurationWorkImages enforces the same rule.
// - "+ Add" picks a picture or video from the Media Catalogue (Marketing
//   or Videos).

// The drag list's name, as a page's component id is in Arrange.
const LIST_ID = "curation-images";

function thumbUrl(img: ArtworkImage): string | null {
  return img.kind === "VIDEO" ? img.posterUrl : img.url;
}

export default function CurationImageEditor(props: {
  curationId: string;
  artworkId: string;
  artistId: string;
  siteId: string;
  // Main first.
  images: ArtworkImage[];
  onSaved: (images: ArtworkImage[]) => void;
  onError: (message: string) => void;
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
  curationId,
  artworkId,
  artistId,
  siteId,
  images,
  onSaved,
  onError,
  dragging,
}: {
  curationId: string;
  artworkId: string;
  artistId: string;
  siteId: string;
  images: ArtworkImage[];
  onSaved: (images: ArtworkImage[]) => void;
  onError: (message: string) => void;
  dragging: ItemDragData | null;
}) {
  const [busy, setBusy] = useState(false);
  const ids = images.map((i) => i.id);
  const [main, ...others] = images;

  const save = async (imageIds: string[]) => {
    setBusy(true);
    const result = await setCurationWorkImages(curationId, artistId, artworkId, imageIds);
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

  return (
    // Four columns: the main image spans three columns and three rows, so
    // it's square and level with the three small squares beside it.
    <div className={`grid grid-cols-4 gap-2.5 ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {main ? (
        <ImageTile image={main} dragging={dragging} className="col-span-3 row-span-3" large>
          <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-900/80 px-1.5 py-0.5 text-[10px] text-white">
            Main
          </span>
        </ImageTile>
      ) : (
        addTile("add-main", "Add main image", "col-span-3 row-span-3")
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
              title="Remove from this curation"
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
