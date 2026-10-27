"use client";

import { useState, type ReactNode } from "react";
import {
  ENTRY_LIMITS,
  newEntry,
  newEntryPicture,
  readEntries,
  writeEntries,
  type EntryPicture,
  type PageEntry,
} from "@/lib/pageEntries";
import { Labelled } from "@/components/blockShapes";
import { PlayMark } from "@/components/SectionMediaView";
import { moveItem, useArrangeItem, useArrangeReorder } from "@/components/arrangeItemDrag";

// An Entries component in a page's Arrange (2026-10-24): the list typed
// straight in — each entry's date and title, and its pictures, each
// chosen from the curation's Supporting Media with a caption and a
// description. Entries can be added, dragged by their ⠿ handle onto
// another to change the order (2026-10-27, the same as everywhere in
// Arrange — see arrangeItemDrag.ts), hidden from the page or removed;
// pictures added or removed. Typing saves when a box is
// left; every other change saves at once (`onSave`, the list as JSON —
// see lib/pageEntries.ts).
export default function EntriesSlot({
  blockId,
  label,
  text,
  images,
  dragging,
  onSave,
}: {
  blockId: string;
  // What's being dragged in Arrange, if anything.
  dragging: { type: string } | null;
  label: string;
  text: string | null;
  // The curation's Supporting Media: a picture, or a video's still
  // picture (null when it has none) with ▶ (2026-10-25).
  images: { id: string; url: string | null; video: boolean }[];
  onSave: (text: string) => void;
}) {
  const [entries, setEntries] = useState<PageEntry[]>(() => readEntries(text));

  const save = (next: PageEntry[]) => onSave(writeEntries(next) ?? "");
  // A change saved at once (adding, moving, hiding, a picture chosen…).
  const commit = (next: PageEntry[]) => {
    setEntries(next);
    save(next);
  };
  // Typing: kept here, saved when the box is left.
  const edit = (id: string, patch: Partial<PageEntry>) =>
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const editPicture = (entry: PageEntry, index: number, patch: Partial<EntryPicture>) =>
    entry.pictures.map((p, i) => (i === index ? { ...p, ...patch } : p));
  useArrangeReorder(blockId, (fromId, toId) => {
    const next = moveItem(entries, (e) => e.id, fromId, toId);
    if (next) commit(next);
  });

  const box =
    "w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none";
  const small =
    "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";
  const blur = () => save(entries);

  return (
    <Labelled label={label}>
      <div className="flex flex-col gap-4">
        {entries.length === 0 && <p className="text-sm text-neutral-400">No entries yet.</p>}
        {entries.length > 1 && <p className="-mb-2 text-xs text-neutral-500">Drag ⠿ to reorder.</p>}
        {entries.map((entry) => (
          <EntryFrame key={entry.id} blockId={blockId} entryId={entry.id} hidden={entry.hidden} dragging={dragging}>
            {(handle) => (
              <>
                <div className="flex items-center gap-2">
                  {handle}
                  <input
                    value={entry.date}
                    onChange={(e) => edit(entry.id, { date: e.target.value })}
                    onBlur={blur}
                    maxLength={ENTRY_LIMITS.date}
                    placeholder="Date — e.g. 2014"
                    className={`${box} w-32 shrink-0`}
                  />
                  <input
                    value={entry.title}
                    onChange={(e) => edit(entry.id, { title: e.target.value })}
                    onBlur={blur}
                    maxLength={ENTRY_LIMITS.title}
                    placeholder="Title"
                    className={box}
                  />
                  <button
                    type="button"
                    className={small}
                    onClick={() => commit(entries.map((e) => (e.id === entry.id ? { ...e, hidden: !e.hidden } : e)))}
                  >
                    {entry.hidden ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    className={`${small} hover:text-red-600`}
                    onClick={() => commit(entries.filter((e) => e.id !== entry.id))}
                    title="Remove this entry"
                  >
                    ✕
                  </button>
                </div>

                {entry.pictures.map((picture, j) => {
                  const chosen = images.find((im) => im.id === picture.imageId);
                  return (
                    <div key={j} className="flex gap-3 rounded-md bg-neutral-50 p-2">
                      <div className="flex w-40 shrink-0 flex-col gap-1.5">
                        <div className="relative aspect-square w-full overflow-hidden rounded bg-neutral-200">
                          {chosen?.url && <img src={chosen.url} alt="" className="h-full w-full object-cover" />}
                          {chosen?.video && <PlayMark />}
                        </div>
                        <input
                          value={picture.caption}
                          onChange={(e) => edit(entry.id, { pictures: editPicture(entry, j, { caption: e.target.value }) })}
                          onBlur={blur}
                          maxLength={ENTRY_LIMITS.caption}
                          placeholder="Caption"
                          className={box}
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {images.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {images.map((im) => (
                              <button
                                key={im.id}
                                type="button"
                                onClick={() =>
                                  commit(
                                    entries.map((e) =>
                                      e.id === entry.id
                                        ? {
                                            ...e,
                                            pictures: editPicture(e, j, {
                                              imageId: picture.imageId === im.id ? null : im.id,
                                            }),
                                          }
                                        : e,
                                    ),
                                  )
                                }
                                title={picture.imageId === im.id ? "Take this picture out" : "Use this picture"}
                                className={`relative h-10 w-10 overflow-hidden rounded ${
                                  picture.imageId === im.id ? "ring-2 ring-blue-500" : "opacity-70 hover:opacity-100"
                                }`}
                              >
                                {im.url ? (
                                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="block h-full w-full bg-neutral-800" />
                                )}
                                {im.video && <PlayMark />}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400">
                            Add Supporting Media to the curation to choose pictures here.
                          </p>
                        )}
                        <textarea
                          value={picture.text}
                          onChange={(e) => edit(entry.id, { pictures: editPicture(entry, j, { text: e.target.value }) })}
                          onBlur={blur}
                          maxLength={ENTRY_LIMITS.text}
                          rows={3}
                          placeholder="Description"
                          className={`${box} resize-y`}
                        />
                        <button
                          type="button"
                          className={`${small} self-end hover:text-red-600`}
                          onClick={() =>
                            commit(
                              entries.map((e) =>
                                e.id === entry.id ? { ...e, pictures: e.pictures.filter((_, k) => k !== j) } : e,
                              ),
                            )
                          }
                        >
                          Remove picture
                        </button>
                      </div>
                    </div>
                  );
                })}
                {entry.pictures.length < ENTRY_LIMITS.pictures && (
                  <button
                    type="button"
                    className={`${small} self-start`}
                    onClick={() =>
                      commit(
                        entries.map((e) =>
                          e.id === entry.id ? { ...e, pictures: [...e.pictures, newEntryPicture()] } : e,
                        ),
                      )
                    }
                  >
                    + Add picture
                  </button>
                )}
              </>
            )}
          </EntryFrame>
        ))}
        {entries.length < ENTRY_LIMITS.entries && (
          <button
            type="button"
            className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
            onClick={() => commit([...entries, newEntry()])}
          >
            + Add entry
          </button>
        )}
      </div>
    </Labelled>
  );
}

// One entry: the frame dragged and dropped on, with its ⠿ handle (only
// the handle starts a drag, so its boxes can still be typed in and
// selected).
function EntryFrame({
  blockId,
  entryId,
  hidden,
  dragging,
  children,
}: {
  blockId: string;
  entryId: string;
  hidden: boolean;
  dragging: { type: string } | null;
  children: (handle: ReactNode) => ReactNode;
}) {
  const drag = useArrangeItem(blockId, entryId, null, dragging);
  const handle = (
    <span
      {...drag.attributes}
      {...drag.listeners}
      title="Drag to reorder"
      className="shrink-0 cursor-grab select-none px-1 text-lg leading-none text-neutral-400 hover:text-neutral-700 active:cursor-grabbing"
    >
      ⠿
    </span>
  );
  return (
    <div
      ref={drag.setNodeRef}
      className={`flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-3 ${hidden ? "opacity-50" : ""} ${
        drag.isDragging ? "opacity-30" : ""
      } ${drag.target ? "ring-4 ring-blue-500" : ""}`}
    >
      {children(handle)}
    </div>
  );
}
