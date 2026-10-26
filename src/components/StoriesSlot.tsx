"use client";

import { useState } from "react";
import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import type { StoriesSettings } from "@/lib/pageStyleLayout";
import {
  readPageStories,
  writePageStories,
  type PageStory,
} from "@/lib/pageStories";
import { Labelled } from "@/components/blockShapes";
import { PlayMark } from "@/components/SectionMediaView";

// A Profile stories component in a page's Arrange (2026-10-26): the
// stories chosen for this page, in order — each can be moved up or down,
// have its picture swapped to the other side (⇄), or be taken off the
// page — then the Profile Catalogue's other stories, to click to add.
// Every change saves at once (`onSave`, the list as JSON — see
// lib/pageStories.ts).
export default function StoriesSlot({
  label,
  settings,
  text,
  stories,
  onSave,
}: {
  label: string;
  settings: StoriesSettings;
  text: string | null;
  // The whole Profile Catalogue, in its order.
  stories: ProfileStoryRow[];
  onSave: (text: string) => void;
}) {
  const [chosen, setChosen] = useState<PageStory[]>(() =>
    readPageStories(text),
  );
  const byId = new Map(stories.map((s) => [s.id, s]));
  // Stories deleted from the catalogue since are dropped here.
  const shown = chosen.filter((c) => byId.has(c.id));
  const others = stories.filter((s) => !chosen.some((c) => c.id === s.id));

  const commit = (next: PageStory[]) => {
    setChosen(next);
    onSave(writePageStories(next) ?? "");
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...shown];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    commit(next);
  };
  const sideOf = (c: PageStory) =>
    c.swap ? (settings.side === "left" ? "right" : "left") : settings.side;

  const small =
    "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

  return (
    <Labelled label={label}>
      <div className="flex flex-col gap-4">
        {stories.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No stories yet — add them in Artworks → Profile Catalogue.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No stories on this page yet — click one below to add it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((c, i) => {
              const story = byId.get(c.id)!;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-2"
                >
                  <Thumb story={story} className="h-14 w-14" />
                  <p className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                    {story.caption || "Untitled"}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      commit(
                        shown.map((s) =>
                          s.id === c.id ? { ...s, swap: !s.swap } : s,
                        ),
                      )
                    }
                    title="Swap the picture to the other side"
                    className={small}
                  >
                    Picture {sideOf(c)} ⇄
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className={small}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === shown.length - 1}
                    className={small}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(shown.filter((s) => s.id !== c.id))}
                    title="Take off this page"
                    className={small}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {others.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-neutral-500">
              Click a story to add it to this page:
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
              {others.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => commit([...shown, { id: s.id, swap: false }])}
                  className="text-left hover:opacity-80"
                >
                  <Thumb story={s} className="aspect-square w-full" />
                  <p className="mt-1 truncate text-xs text-neutral-700">
                    {s.caption || "Untitled"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Labelled>
  );
}

function Thumb({
  story,
  className,
}: {
  story: ProfileStoryRow;
  className: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded bg-neutral-100 ${className}`}
    >
      {story.media?.thumbUrl && (
        <img
          src={story.media.thumbUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      {story.media?.kind === "VIDEO" && <PlayMark />}
    </div>
  );
}
