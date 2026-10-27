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
import { moveItem, useArrangeItem, useArrangeReorder } from "@/components/arrangeItemDrag";

// A Profile stories component in a page's Arrange (2026-10-26): the
// stories on this page, in order — drag one onto another to change the
// order (2026-10-27, the same as a component's pictures — see
// arrangeItemDrag.ts), swap its picture to the other side (⇄), or take it
// off the page (✕). Stories are added by dragging them here from the
// Sections column (Craig's choice), so this shows only what's on the
// page. Every change saves at once (`onSave`, the list as JSON — see
// lib/pageStories.ts).
export default function StoriesSlot({
  blockId,
  label,
  settings,
  text,
  stories,
  dragging,
  onSave,
}: {
  blockId: string;
  label: string;
  settings: StoriesSettings;
  text: string | null;
  // The whole Profile Catalogue.
  stories: ProfileStoryRow[];
  // What's being dragged in Arrange, if anything.
  dragging: { type: string } | null;
  onSave: (text: string) => void;
}) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  // Stories deleted from the catalogue since are dropped here.
  const shown = readPageStories(text).filter((c) => byId.has(c.id));

  const commit = (next: PageStory[]) => onSave(writePageStories(next) ?? "");
  useArrangeReorder(blockId, (fromId, toId) => {
    const next = moveItem(shown, (s) => s.id, fromId, toId);
    if (next) commit(next);
  });
  const sideOf = (c: PageStory) =>
    c.swap ? (settings.side === "left" ? "right" : "left") : settings.side;

  return (
    <Labelled label={label}>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          {stories.length === 0
            ? "No stories yet — add them in Artworks → Profile Catalogue."
            : "Drag stories here from the list on the left."}
        </p>
      ) : (
        <>
          {shown.length > 1 && <p className="mb-2 text-xs text-neutral-500">Drag to reorder.</p>}
          <div className="flex flex-col gap-2">
            {shown.map((c) => (
              <StoryRow
                key={c.id}
                blockId={blockId}
                story={byId.get(c.id)!}
                side={sideOf(c)}
                dragging={dragging}
                onSwap={() => commit(shown.map((s) => (s.id === c.id ? { ...s, swap: !s.swap } : s)))}
                onRemove={() => commit(shown.filter((s) => s.id !== c.id))}
              />
            ))}
          </div>
        </>
      )}
    </Labelled>
  );
}

function StoryRow({
  blockId,
  story,
  side,
  dragging,
  onSwap,
  onRemove,
}: {
  blockId: string;
  story: ProfileStoryRow;
  side: string;
  dragging: { type: string } | null;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const drag = useArrangeItem(blockId, story.id, story.media?.thumbUrl ?? null, dragging);
  const small = "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50";
  // The buttons don't start a drag.
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      className={`flex cursor-grab items-center gap-3 rounded-md border border-neutral-200 bg-white p-2 active:cursor-grabbing ${
        drag.isDragging ? "opacity-30" : ""
      } ${drag.target ? "ring-4 ring-blue-500" : ""}`}
    >
      <StoryThumb story={story} className="h-14 w-14" />
      <p className="min-w-0 flex-1 truncate text-sm text-neutral-800">{story.caption || "Untitled"}</p>
      <button
        type="button"
        onPointerDown={stop}
        onClick={onSwap}
        title="Swap the picture to the other side"
        className={small}
      >
        Picture {side} ⇄
      </button>
      <button type="button" onPointerDown={stop} onClick={onRemove} title="Take off this page" className={small}>
        ✕
      </button>
    </div>
  );
}
