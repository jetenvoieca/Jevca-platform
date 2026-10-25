"use client";

import { useState } from "react";
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

// An Entries component in a page's Arrange (2026-10-24): the list typed
// straight in — each entry's date and title, and its pictures, each
// chosen from the curation's Supporting Media with a caption and a
// description. Entries can be added, moved up or down, hidden from the
// page or removed; pictures added or removed. Typing saves when a box is
// left; every other change saves at once (`onSave`, the list as JSON —
// see lib/pageEntries.ts).
export default function EntriesSlot({
  label,
  text,
  images,
  onSave,
}: {
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
  const move = (index: number, by: -1 | 1) => {
    const next = [...entries];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    commit(next);
  };

  const box =
    "w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none";
  const small =
    "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";
  const blur = () => save(entries);

  return (
    <Labelled label={label}>
      <div className="flex flex-col gap-4">
        {entries.length === 0 && <p className="text-sm text-neutral-400">No entries yet.</p>}
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`flex flex-col gap-2 rounded-md border border-neutral-200 p-3 ${entry.hidden ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2">
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
              <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={i === entries.length - 1}
                onClick={() => move(i, 1)}
                title="Move down"
              >
                ↓
              </button>
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
          </div>
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
