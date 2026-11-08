"use client";

import { useState } from "react";
import { DndContext, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { reorderProfileStories, type ProfileStoryRow } from "@/lib/actions/profileStories";
import ProfileStoryModal, { type GalleryOption } from "@/components/ProfileStoryModal";
import ArtistProfileModal, { type ArtistProfile } from "@/components/artist-app/ArtistProfileModal";
import { MainPanel, PanelHeading } from "@/components/artist-app/ArtistAppPanels";
import {
  DragThumb,
  TOUCH_DRAG_CLASS,
  ignoreClickAfterDrag,
  useArtistAppSensors,
} from "@/components/artist-app/artistAppDrag";
import { moveItem, useArrangeItem, useArrangeReorder, type ItemDragData } from "@/components/arrangeItemDrag";
import { PlayMark } from "@/components/SectionMediaView";

// Update CV (2026-11-08, Craig's mockups). Under Biography: the Profile
// Catalogue's fixed entries (Artist Statement, Biography / CV, Galleries)
// and the client's Profile (its logo); under Stories: the stories, dragged
// to reorder. Tapping one opens its window — the Profile Catalogue's
// (ProfileStoryModal) or the Profile's (ArtistProfileModal). New stories
// are added in the admin for now.

const STORIES = "stories";

export default function ArtistCvView({
  siteId,
  artist,
  initialEntries,
  galleries,
}: {
  siteId: string;
  artist: ArtistProfile;
  // listProfileCatalogue: the fixed entries first, then the stories.
  initialEntries: ProfileStoryRow[];
  galleries: GalleryOption[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [openId, setOpenId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dragging, setDragging] = useState<ItemDragData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useArtistAppSensors();

  const fixed = entries.filter((e) => e.kind !== "STORY");
  const stories = entries.filter((e) => e.kind === "STORY");
  const open = entries.find((e) => e.id === openId) ?? null;

  const reorder = async (fromId: string, toId: string) => {
    const next = moveItem(stories, (s) => s.id, fromId, toId);
    if (!next) return;
    const before = entries;
    setEntries([...fixed, ...next]);
    setError(null);
    const result = await reorderProfileStories(
      artist.id,
      next.map((s) => s.id),
    ).catch(() => ({ error: "The stories' new order wasn't saved." }));
    if ("error" in result) {
      setEntries(before);
      setError(result.error);
    }
  };

  return (
    <MainPanel>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as ItemDragData | undefined) ?? null)}
        onDragEnd={() => {
          setDragging(null);
          ignoreClickAfterDrag();
        }}
        onDragCancel={() => {
          setDragging(null);
          ignoreClickAfterDrag();
        }}
      >
        <div className="mx-auto max-w-4xl">
          {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}

          <PanelHeading>Biography</PanelHeading>
          <EntryGrid>
            {fixed.map((e) => (
              <Tile key={e.id} label={e.caption} onClick={() => setOpenId(e.id)}>
                <EntryPicture entry={e} />
              </Tile>
            ))}
            <Tile label="Profile" bold onClick={() => setProfileOpen(true)}>
              {artist.logoUrl ? (
                <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-neutral-300 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artist.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="aspect-square w-full rounded-sm border border-neutral-300" />
              )}
            </Tile>
          </EntryGrid>

          <div className="mt-10">
            <PanelHeading>Stories</PanelHeading>
            {stories.length === 0 ? (
              <p className="text-center text-neutral-400">No stories yet</p>
            ) : (
              <StoryGrid stories={stories} dragging={dragging} onMove={reorder} onOpen={setOpenId} />
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>{dragging && <DragThumb url={dragging.url} />}</DragOverlay>
      </DndContext>

      {open && (
        <ProfileStoryModal
          key={open.id}
          story={open}
          artistId={artist.id}
          siteId={siteId}
          galleries={galleries}
          onClose={() => setOpenId(null)}
          onSaved={(row) => setEntries((prev) => prev.map((e) => (e.id === row.id ? row : e)))}
          onDeleted={() => {
            setEntries((prev) => prev.filter((e) => e.id !== open.id));
            setOpenId(null);
          }}
        />
      )}
      {profileOpen && <ArtistProfileModal artist={artist} onClose={() => setProfileOpen(false)} />}
    </MainPanel>
  );
}

function EntryGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">{children}</div>;
}

function Tile({
  label,
  bold = false,
  onClick,
  children,
}: {
  label: string;
  bold?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="block min-w-0 text-left">
      {children}
      <p className={`mt-2 truncate text-sm text-neutral-800 ${bold ? "font-semibold" : ""}`}>{label}</p>
    </button>
  );
}

// An entry's picture (a video's still, with a play mark), or an empty
// square until it has one.
function EntryPicture({ entry }: { entry: ProfileStoryRow }) {
  return (
    <div className="relative">
      {entry.media?.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.media.thumbUrl}
          alt=""
          draggable={false}
          className="aspect-square w-full rounded-sm object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded-sm border border-neutral-300" />
      )}
      {entry.media?.kind === "VIDEO" && <PlayMark />}
    </div>
  );
}

// The stories; one dragged onto another moves there.
function StoryGrid({
  stories,
  dragging,
  onMove,
  onOpen,
}: {
  stories: ProfileStoryRow[];
  dragging: ItemDragData | null;
  onMove: (fromId: string, toId: string) => void;
  onOpen: (id: string) => void;
}) {
  useArrangeReorder(STORIES, onMove);
  return (
    <EntryGrid>
      {stories.map((s) => (
        <StoryTile key={s.id} story={s} dragging={dragging} onClick={() => onOpen(s.id)} />
      ))}
    </EntryGrid>
  );
}

function StoryTile({
  story,
  dragging,
  onClick,
}: {
  story: ProfileStoryRow;
  dragging: ItemDragData | null;
  onClick: () => void;
}) {
  const drag = useArrangeItem(STORIES, story.id, story.media?.thumbUrl ?? null, dragging);
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      className={`cursor-grab ${TOUCH_DRAG_CLASS} ${drag.isDragging ? "opacity-30" : ""} ${
        drag.target ? "outline outline-4 outline-neutral-400" : ""
      }`}
    >
      <Tile label={story.caption || "Untitled"} onClick={onClick}>
        <EntryPicture entry={story} />
      </Tile>
    </div>
  );
}
