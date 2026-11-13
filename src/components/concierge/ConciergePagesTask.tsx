"use client";

import { useEffect, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { conciergeSitePages } from "@/lib/actions/concierge";
import type { ArtistAppPage } from "@/lib/actions/artistApp";
import { arrangePages } from "@/lib/artistAppPageOrder";
import PageOrderLists, {
  DraggedPage,
  pageListCollisions,
  usePageOrder,
  type PageDragData,
  type PageDropData,
} from "@/components/PageOrderLists";
import { ignoreClickAfterDrag, useArtistAppSensors } from "@/components/artist-app/artistAppDrag";

// Concierge — Reorder pages (2026-11-13, Craig's mockup): the site's Live
// and Hidden pages, as the artist's Arrange Pages shows them, dragged into
// the order asked for. Each drop is saved to the site at once.
export default function ConciergePagesTask({ siteId }: { siteId: string }) {
  const [loaded, setLoaded] = useState<{ pages: ArtistAppPage[]; pagesPerGroup: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    conciergeSitePages(siteId)
      .then(setLoaded)
      .catch(() => setError("The site's pages couldn't be loaded."));
  }, [siteId]);

  if (!loaded) return <p className="text-center text-sm text-neutral-400">{error ?? "Loading the pages…"}</p>;
  return <PagesEditor siteId={siteId} initialPages={loaded.pages} pagesPerGroup={loaded.pagesPerGroup} />;
}

function PagesEditor({
  siteId,
  initialPages,
  pagesPerGroup,
}: {
  siteId: string;
  initialPages: ArtistAppPage[];
  pagesPerGroup: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useArtistAppSensors();
  const { pages, setPages, dropPage } = usePageOrder(siteId, initialPages, { onError: setError });

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    ignoreClickAfterDrag();
    const from = e.active.data.current as PageDragData | undefined;
    const to = e.over?.data.current as PageDropData | undefined;
    if (!from || !to) return;
    dropPage(from.pageId, to.kind === "page" ? { pageId: to.pageId } : { visible: to.visible });
  };

  const dragged = pages.find((p) => p.id === draggingId);

  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-6">
      <div className="mx-auto flex w-64 flex-col">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <DndContext
          sensors={sensors}
          collisionDetection={pageListCollisions}
          onDragStart={(e: DragStartEvent) =>
            setDraggingId((e.active.data.current as PageDragData | undefined)?.pageId ?? null)
          }
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDraggingId(null);
            ignoreClickAfterDrag();
          }}
        >
          <PageOrderLists
            siteId={siteId}
            pages={pages}
            pagesPerGroup={pagesPerGroup}
            onAdded={(page) => setPages((prev) => arrangePages([...prev, page]))}
          />
          <DragOverlay dropAnimation={null}>{dragged ? <DraggedPage title={dragged.title} /> : null}</DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
