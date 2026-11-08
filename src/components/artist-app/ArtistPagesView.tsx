"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  getArtistAppPageWorks,
  type ArtistAppPage,
  type ArtistAppPageWorks,
} from "@/lib/actions/artistApp";
import { reorderPages } from "@/lib/actions/pages";
import { setPageComponentItems } from "@/lib/actions/pageComponents";
import { movePage, type PageDrop } from "@/lib/artistAppPageOrder";
import { moveItem, useArrangeItem, useArrangeReorder, type ItemDragData } from "@/components/arrangeItemDrag";
import CurationWorkPresentationModal from "@/components/CurationWorkPresentationModal";
import { MainPanel, SidePanel, WorkGrid, WorkTile } from "@/components/artist-app/ArtistAppPanels";
import { DragThumb, useArtistAppSensors } from "@/components/artist-app/artistAppDrag";
import type { SiteWork } from "@/lib/siteWorks";

// Arrange Pages (2026-11-08, Craig's mockup): the site's Live and Hidden
// pages (pages under another indented beneath it) beside the chosen
// page's works. Drag a page to reorder it or move it between Live and
// Hidden (rules in lib/artistAppPageOrder.ts); drag a work onto another
// to reorder the page's works — on this page only, where the page allows
// it (see getArtistAppPageWorks). On a touch screen, press and hold
// before dragging (useArtistAppSensors). Tapping a work opens its
// Presentation in the curation the page shows it from (Craig, 8 Nov).

type PageDragData = { type: "page"; pageId: string };
type PageDropData = { kind: "page"; pageId: string } | { kind: "list"; visible: boolean };
type DragData = PageDragData | ItemDragData;

// The pointer's page row (or work) rather than the list around it.
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const inner = hits.find((h) => h.data?.droppableContainer.data.current?.kind !== "list");
  return inner ? [inner] : hits;
};

export default function ArtistPagesView({
  siteId,
  artistId,
  pages: initialPages,
  firstPageId,
  firstWorks,
}: {
  siteId: string;
  artistId: string;
  // Arranged (arrangePages).
  pages: ArtistAppPage[];
  firstPageId: string | null;
  firstWorks: ArtistAppPageWorks | null;
}) {
  const [pages, setPages] = useState(initialPages);
  const [selectedId, setSelectedId] = useState(firstPageId);
  const [works, setWorks] = useState(firstWorks);
  // Counts loads, so the grid starts afresh with each.
  const [worksLoad, setWorksLoad] = useState(0);
  const [loadingWorks, setLoadingWorks] = useState(false);
  // The work whose Presentation is open.
  const [presenting, setPresenting] = useState<SiteWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);

  const sensors = useArtistAppSensors();

  const loadWorks = async (pageId: string) => {
    setLoadingWorks(true);
    setError(null);
    try {
      setWorks(await getArtistAppPageWorks(siteId, pageId));
    } catch {
      setWorks(null);
      setError("That page's works couldn't be loaded.");
    } finally {
      setWorksLoad((n) => n + 1);
      setLoadingWorks(false);
    }
  };

  const selectPage = (pageId: string) => {
    if (pageId === selectedId) return;
    setSelectedId(pageId);
    loadWorks(pageId);
  };

  const dropPage = async (fromId: string, drop: PageDrop) => {
    const next = movePage(pages, fromId, drop);
    if (!next) return;
    const before = pages;
    setPages(next);
    setError(null);
    try {
      await reorderPages(
        siteId,
        next.filter((p) => p.visible).map((p) => p.id),
        next.filter((p) => !p.visible).map((p) => p.id),
      );
    } catch {
      setPages(before);
      setError("The pages' new order wasn't saved.");
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const from = e.active.data.current as DragData | undefined;
    const to = e.over?.data.current as PageDropData | undefined;
    if (from?.type !== "page" || !to) return;
    dropPage(from.pageId, to.kind === "page" ? { pageId: to.pageId } : { visible: to.visible });
  };

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const titleOf = (id: string | null) => pages.find((p) => p.id === id)?.title ?? "";
  const draggedPage = dragging?.type === "page" ? pages.find((p) => p.id === dragging.pageId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as DragData | undefined) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <MainPanel heading={selected?.title ?? "Pages"}>
          {loadingWorks ? (
            <p className="text-center text-neutral-400">Loading…</p>
          ) : selected && works ? (
            <PageWorks
              key={`${selected.id}:${worksLoad}`}
              siteId={siteId}
              pageId={selected.id}
              data={works}
              dragging={dragging}
              onError={setError}
              onOpen={setPresenting}
            />
          ) : null}
        </MainPanel>

        <SidePanel>
          {error && <p className="px-1 text-sm text-red-600">{error}</p>}
          {[true, false].map((visible) => (
            <PageList key={String(visible)} visible={visible}>
              {pages
                .filter((p) => p.visible === visible)
                .map((p) => {
                  const parentHere = !!p.parentId && pages.some((q) => q.id === p.parentId && q.visible === visible);
                  return (
                    <PageRow
                      key={p.id}
                      page={p}
                      selected={p.id === selectedId}
                      under={p.parentId && !parentHere ? titleOf(p.parentId) : null}
                      onSelect={() => selectPage(p.id)}
                    />
                  );
                })}
            </PageList>
          ))}
        </SidePanel>

        <DragOverlay dropAnimation={null}>
          {draggedPage ? (
            <div className="w-72 rounded-sm border border-neutral-500 bg-white px-4 py-2 text-sm text-neutral-800 shadow-md">
              {draggedPage.title}
            </div>
          ) : dragging?.type === "item" ? (
            <DragThumb url={dragging.url} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {presenting && selected && (
        <CurationWorkPresentationModal
          curationId={presenting.curationId}
          artworkId={presenting.artworkId}
          workName={presenting.catalogueName}
          artistId={artistId}
          siteId={siteId}
          onClose={() => setPresenting(null)}
          // Its name, main picture or price may have changed.
          onArtworkChanged={() => loadWorks(selected.id)}
        />
      )}
    </>
  );
}

// Live or Hidden: its heading and its pages; dropping a page on its
// empty space puts it at the end. Hidden sits straight under Live
// (Craig, 8 Nov) and takes the rest of the panel; Live keeps a little
// space below its pages to drop onto.
function PageList({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const drop = useDroppable({ id: `list:${visible}`, data: { kind: "list", visible } satisfies PageDropData });
  return (
    <div
      ref={drop.setNodeRef}
      className={`flex flex-col gap-1.5 rounded-sm pt-5 ${visible ? "flex-none pb-8" : "min-h-48 flex-[1_0_auto]"} ${
        drop.isOver ? "bg-neutral-50" : ""
      }`}
    >
      <h3 className="mb-2 text-center text-lg text-neutral-800">{visible ? "Live Pages" : "Hidden Pages"}</h3>
      {children}
    </div>
  );
}

function PageRow({
  page,
  selected,
  under,
  onSelect,
}: {
  page: ArtistAppPage;
  selected: boolean;
  // The top page's name, when it's in the other list.
  under: string | null;
  onSelect: () => void;
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
      className={`flex items-baseline justify-between gap-2 rounded-sm border bg-white px-4 py-2 text-left text-sm text-neutral-800 [touch-action:manipulation] ${
        page.parentId ? "ml-6" : ""
      } ${selected ? "border-neutral-600" : "border-neutral-200 hover:bg-neutral-50"} ${
        drag.isDragging ? "opacity-30" : ""
      } ${drop.isOver && !drag.isDragging ? "ring-2 ring-neutral-400" : ""}`}
    >
      <span className="min-w-0 truncate">{page.title}</span>
      {under && <span className="shrink-0 text-xs text-neutral-400">under {under}</span>}
    </button>
  );
}

// The chosen page's works; dragged into a new order where the page
// allows it, saved for this page only.
function PageWorks({
  siteId,
  pageId,
  data,
  dragging,
  onError,
  onOpen,
}: {
  siteId: string;
  pageId: string;
  data: ArtistAppPageWorks;
  dragging: DragData | null;
  onError: (message: string | null) => void;
  // A work tapped: its Presentation, in the curation it's shown from.
  onOpen: (work: SiteWork) => void;
}) {
  const [works, setWorks] = useState(data.works);
  const arrange = data.arrange;

  useArrangeReorder(arrange?.blockId ?? "", async (fromId, toId) => {
    if (!arrange) return;
    const next = moveItem(works, (w) => w.artworkId, fromId, toId);
    if (!next) return;
    const before = works;
    setWorks(next);
    onError(null);
    const result = await setPageComponentItems(siteId, pageId, arrange.blockId, {
      hiddenIds: arrange.hiddenIds,
      orderIds: next.map((w) => w.artworkId),
    }).catch(() => ({ error: "" }));
    if ("error" in result) {
      setWorks(before);
      onError("The works' new order wasn't saved.");
    }
  });

  return (
    <>
      {data.kind !== "arrange" && (
        <p className="-mt-4 mb-6 text-center text-sm text-neutral-400">
          {data.kind === "showcase"
            ? "This page shows the site's works in a new order on every visit."
            : "The order of this page's works can't be changed here."}
        </p>
      )}
      {works.length === 0 ? (
        <p className="text-center text-neutral-400">No works on this page</p>
      ) : (
        <WorkGrid>
          {works.map((w, i) =>
            arrange ? (
              <DraggableWork
                key={w.artworkId}
                blockId={arrange.blockId}
                work={w}
                dragging={dragging}
                onClick={() => onOpen(w)}
              />
            ) : (
              <WorkTile key={`${w.artworkId}:${i}`} work={w} onClick={() => onOpen(w)} className="cursor-pointer" />
            ),
          )}
        </WorkGrid>
      )}
    </>
  );
}

function DraggableWork({
  blockId,
  work,
  dragging,
  onClick,
}: {
  blockId: string;
  work: SiteWork;
  dragging: DragData | null;
  onClick: () => void;
}) {
  const drag = useArrangeItem(blockId, work.artworkId, work.imageUrl, dragging);
  return (
    <WorkTile
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onClick}
      work={work}
      className={`cursor-grab [touch-action:manipulation] ${drag.isDragging ? "opacity-30" : ""} ${
        drag.target ? "outline outline-4 outline-neutral-400" : ""
      }`}
    />
  );
}
