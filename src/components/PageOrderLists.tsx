"use client";

import { Fragment, useState } from "react";
import { pointerWithin, useDraggable, useDroppable, type CollisionDetection } from "@dnd-kit/core";
import { addArtistAppGroupPage, type ArtistAppPage } from "@/lib/actions/artistApp";
import { reorderPages } from "@/lib/actions/pages";
import { movePage, type PageDrop } from "@/lib/artistAppPageOrder";
import { TOUCH_DRAG_CLASS } from "@/components/artist-app/artistAppDrag";

// A site's Live and Hidden pages, dragged into order (2026-11-08, Craig's
// mockup; rules in lib/artistAppPageOrder.ts). Pages under another are
// indented beneath it; under a group of curation pages, "Add new … page"
// adds one (a new curation and its page, in Hidden — addArtistAppGroupPage).
// Shared by the Artist App's Arrange Pages and Administration → Concierge's
// Reorder pages (2026-11-13), each inside its own DndContext.

export type PageDragData = { type: "page"; pageId: string };
export type PageDropData = { kind: "page"; pageId: string } | { kind: "list"; visible: boolean };

// The pointer's page row (or work) rather than the list around it.
export const pageListCollisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const inner = hits.find((h) => h.data?.droppableContainer.data.current?.kind !== "list");
  return inner ? [inner] : hits;
};

// The pages, and dropping one in a new place — saved at once (both lists,
// reorderPages), put back if it wasn't.
export function usePageOrder(
  siteId: string,
  initialPages: ArtistAppPage[],
  { onError, onSaved }: { onError: (message: string | null) => void; onSaved?: () => void },
) {
  const [pages, setPages] = useState(initialPages);
  const dropPage = async (fromId: string, drop: PageDrop) => {
    const next = movePage(pages, fromId, drop);
    if (!next) return;
    const before = pages;
    setPages(next);
    onError(null);
    try {
      await reorderPages(
        siteId,
        next.filter((p) => p.visible).map((p) => p.id),
        next.filter((p) => !p.visible).map((p) => p.id),
      );
      onSaved?.();
    } catch {
      setPages(before);
      onError("The pages' new order wasn't saved.");
    }
  };
  return { pages, setPages, dropPage };
}

export default function PageOrderLists({
  siteId,
  pages,
  pagesPerGroup,
  selectedId = null,
  dropAllowed = () => true,
  onSelect,
  onAdded,
}: {
  siteId: string;
  // Arranged (arrangePages).
  pages: ArtistAppPage[];
  // The site's plan's pages per group (null: no limit).
  pagesPerGroup: number | null;
  selectedId?: string | null;
  // Whether what's being dragged can be dropped on this page (a page
  // always; the Artist App's works only onto a page they can move to).
  dropAllowed?: (pageId: string) => boolean;
  onSelect?: (pageId: string) => void;
  onAdded: (page: ArtistAppPage) => void;
}) {
  const titleOf = (id: string | null) => pages.find((p) => p.id === id)?.title ?? "";
  return (
    <>
      {[true, false].map((visible) => {
        const listed = pages.filter((p) => p.visible === visible);
        return (
          <PageList key={String(visible)} visible={visible}>
            {listed.map((p, i) => {
              const parentHere = !!p.parentId && listed.some((q) => q.id === p.parentId);
              // After a group's last page in this list, its Add.
              const groupId = parentHere ? p.parentId : p.id;
              const next = listed[i + 1];
              const lastOfGroup = !!groupId && next?.parentId !== groupId;
              const addTo = lastOfGroup && groupId && addsPages(pages, groupId) ? groupId : null;
              return (
                <Fragment key={p.id}>
                  <PageRow
                    page={p}
                    dropAllowed={dropAllowed(p.id)}
                    selected={p.id === selectedId}
                    under={p.parentId && !parentHere ? titleOf(p.parentId) : null}
                    onSelect={onSelect ? () => onSelect(p.id) : undefined}
                  />
                  {addTo && (
                    <AddGroupPage
                      siteId={siteId}
                      groupId={addTo}
                      groupTitle={titleOf(addTo)}
                      limit={
                        pagesPerGroup !== null && pages.filter((c) => c.parentId === addTo).length >= pagesPerGroup
                          ? pagesPerGroup
                          : null
                      }
                      onAdded={onAdded}
                    />
                  )}
                </Fragment>
              );
            })}
          </PageList>
        );
      })}
    </>
  );
}

// Live or Hidden (only Hidden headed — Craig's screenshot, 2026-11-11)
// and its pages; dropping a page on its
// empty space puts it at the end. Hidden sits straight under Live
// (Craig, 8 Nov) and takes the rest of the panel; Live keeps a little
// space below its pages to drop onto.
function PageList({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const drop = useDroppable({ id: `list:${visible}`, data: { kind: "list", visible } satisfies PageDropData });
  return (
    <div
      ref={drop.setNodeRef}
      className={`flex flex-col gap-1.5 rounded-sm ${visible ? "flex-none pb-8" : "min-h-48 flex-[1_0_auto] pt-5"} ${
        drop.isOver ? "bg-neutral-50" : ""
      }`}
    >
      {!visible && <h3 className="mb-2 text-center text-lg text-neutral-800">Hidden Pages</h3>}
      {children}
    </div>
  );
}

// A group whose pages all show a curation (e.g. portfolio) can have more
// added.
function addsPages(pages: ArtistAppPage[], groupId: string): boolean {
  const group = pages.find((p) => p.id === groupId);
  const children = pages.filter((p) => p.parentId === groupId);
  return !!group && !group.parentId && children.length > 0 && children.every((c) => c.hasCuration);
}

// "Add new … page": tapped, a name box and Add (Enter); see
// addArtistAppGroupPage. Once the group has the pages its plan allows
// (`limit`, 2026-11-09), it says so instead.
function AddGroupPage({
  siteId,
  groupId,
  groupTitle,
  limit,
  onAdded,
}: {
  siteId: string;
  groupId: string;
  groupTitle: string;
  limit: number | null;
  onAdded: (page: ArtistAppPage) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    const result = await addArtistAppGroupPage(siteId, groupId, name).catch(() => ({
      error: "The page wasn't added — please try again.",
    }));
    setSaving(false);
    if ("error" in result) return setError(result.error);
    setNaming(false);
    setName("");
    onAdded(result);
  };

  if (limit !== null) {
    return (
      <p className="ml-6 px-4 py-2 text-sm text-neutral-400">
        {groupTitle} has its {limit} pages
      </p>
    );
  }
  if (!naming) {
    return (
      <button
        type="button"
        onClick={() => setNaming(true)}
        className="ml-6 rounded-sm border border-neutral-200 bg-white px-4 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        Add new {groupTitle} page
      </button>
    );
  }
  return (
    <div className="ml-6 flex flex-col gap-1">
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") setNaming(false);
          }}
          placeholder="New page's name"
          className="min-w-0 flex-1 rounded-sm border border-neutral-400 px-3 py-1.5 text-sm text-neutral-900"
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          className="shrink-0 rounded-sm border border-neutral-400 px-3 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNaming(false);
            setError(null);
          }}
          aria-label="Cancel"
          className="shrink-0 px-1.5 text-sm text-neutral-500 hover:text-neutral-800"
        >
          ✕
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PageRow({
  page,
  dropAllowed,
  selected,
  under,
  onSelect,
}: {
  page: ArtistAppPage;
  dropAllowed: boolean;
  selected: boolean;
  // The top page's name, when it's in the other list.
  under: string | null;
  onSelect?: () => void;
}) {
  const drag = useDraggable({ id: `page:${page.id}`, data: { type: "page", pageId: page.id } satisfies PageDragData });
  const drop = useDroppable({ id: `pagedrop:${page.id}`, data: { kind: "page", pageId: page.id } satisfies PageDropData });
  return (
    <button
      type="button"
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onSelect}
      className={`flex items-baseline justify-between gap-2 rounded-sm border bg-white px-4 py-2 text-left text-sm text-neutral-800 ${TOUCH_DRAG_CLASS} ${
        page.parentId ? "ml-6" : ""
      } ${selected ? "border-neutral-600" : "border-neutral-200 hover:bg-neutral-50"} ${
        drag.isDragging ? "opacity-30" : ""
      } ${drop.isOver && dropAllowed && !drag.isDragging ? "ring-2 ring-neutral-400" : ""}`}
    >
      <span className="min-w-0 truncate">{page.title}</span>
      {under && <span className="shrink-0 text-xs text-neutral-400">under {under}</span>}
    </button>
  );
}

// What follows the pointer while a page is dragged.
export function DraggedPage({ title }: { title: string }) {
  return (
    <div className="w-72 rounded-sm border border-neutral-500 bg-white px-4 py-2 text-sm text-neutral-800 shadow-md">
      {title}
    </div>
  );
}
