"use client";

import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import type { StoriesSettings } from "@/lib/pageStyleLayout";
import {
  readPageStories,
  writePageStories,
  type PageStory,
} from "@/lib/pageStories";
import { Labelled } from "@/components/blockShapes";
import { StoryThumb } from "@/components/StoryThumb";

// A Profile stories component in a page's Arrange (2026-10-26): the
// stories on this page, in order — each can be moved up or down, have
// its picture swapped to the other side (⇄), or be taken off the page.
// Stories are added by dragging them here from the Sections column
// (Craig's choice), so this shows only what's on the page. Every change
// saves at once (`onSave`, the list as JSON — see lib/pageStories.ts).
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
  // The whole Profile Catalogue.
  stories: ProfileStoryRow[];
  onSave: (text: string) => void;
}) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  // Stories deleted from the catalogue since are dropped here.
  const shown = readPageStories(text).filter((c) => byId.has(c.id));

  const commit = (next: PageStory[]) => onSave(writePageStories(next) ?? "");
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
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          {stories.length === 0
            ? "No stories yet — add them in Artworks → Profile Catalogue."
            : "Drag stories here from the list on the left."}
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
                <StoryThumb story={story} className="h-14 w-14" />
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
    </Labelled>
  );
}
