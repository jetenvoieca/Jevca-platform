"use client";

import { useEffect, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { conciergeSitePages, type ConciergeNote } from "@/lib/actions/concierge";
import { getArtistAppPageContent, type ArtistAppPage, type ArtistAppPageContent } from "@/lib/actions/artistApp";
import { arrangePages, pageToOpen } from "@/lib/artistAppPageOrder";
import PageOrderLists, {
  DraggedPage,
  pageListCollisions,
  usePageOrder,
  type PageDragData,
  type PageDropData,
} from "@/components/PageOrderLists";
import PageWorks from "@/components/PageWorksArranger";
import type { ItemDragData } from "@/components/arrangeItemDrag";
import { DragThumb, ignoreClickAfterDrag, useArtistAppSensors } from "@/components/artist-app/artistAppDrag";

// The Concierge tasks done on a site's pages (2026-11-13, Craig's mockups),
// with the same lists and works as the artist's Arrange Pages. Each drop
// is saved to the site at once.

// Reorder pages: the site's Live and Hidden pages, dragged into order.
export function ConciergePagesTask({ note }: { note: ConciergeNote }) {
  return <SitePages note={note} withWorks={false} />;
}

// Rearrange artworks on a page: the page the artist chose (or choose it),
// then drag its works into order (or Remove work).
export function ConciergeArrangeTask({ note }: { note: ConciergeNote }) {
  return <SitePages note={note} withWorks />;
}

function SitePages({ note, withWorks }: { note: ConciergeNote; withWorks: boolean }) {
  if (!note.siteId) {
    return (
      <p className="text-center text-sm text-neutral-500">
        This request doesn&apos;t say which of {note.client}&apos;s sites it&apos;s for.
      </p>
    );
  }
  return <SitePagesLoader siteId={note.siteId} withWorks={withWorks} pageId={withWorks ? note.pageId : null} />;
}

function SitePagesLoader({
  siteId,
  withWorks,
  pageId,
}: {
  siteId: string;
  withWorks: boolean;
  pageId: string | null;
}) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof conciergeSitePages>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    conciergeSitePages(siteId)
      .then(setLoaded)
      .catch(() => setError("The site's pages couldn't be loaded."));
  }, [siteId]);

  if (!loaded) return <p className="text-center text-sm text-neutral-400">{error ?? "Loading the pages…"}</p>;
  return (
    <SitePagesEditor
      siteId={siteId}
      artistId={loaded.artistId}
      initialPages={loaded.pages}
      pagesPerGroup={loaded.pagesPerGroup}
      withWorks={withWorks}
      initialPageId={pageId}
    />
  );
}

type WorksContent = Extract<ArtistAppPageContent, { works: unknown }>;

function SitePagesEditor({
  siteId,
  artistId,
  initialPages,
  pagesPerGroup,
  withWorks,
  initialPageId,
}: {
  siteId: string;
  artistId: string;
  initialPages: ArtistAppPage[];
  pagesPerGroup: number | null;
  withWorks: boolean;
  // The page to open on (the one the request is about).
  initialPageId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<PageDragData | ItemDragData | null>(null);
  const sensors = useArtistAppSensors();
  const { pages, setPages, dropPage } = usePageOrder(siteId, initialPages, { onError: setError });
  // The page whose works are shown, and them (null while loading, or for
  // a page without works).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<{ load: number; works: WorksContent | null } | null>(null);

  const loadContent = async (pageId: string) => {
    setContent(null);
    setError(null);
    try {
      const got = await getArtistAppPageContent(siteId, pageId);
      setContent((c) => ({ load: (c?.load ?? 0) + 1, works: "works" in got ? got : null }));
    } catch {
      setError("That page couldn't be loaded.");
    }
  };

  const selectPage = (chosenId: string) => {
    const pageId = pageToOpen(pages, chosenId);
    setSelectedId(pageId);
    loadContent(pageId);
  };

  useEffect(() => {
    if (initialPageId && initialPages.some((p) => p.id === initialPageId)) selectPage(initialPageId);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    ignoreClickAfterDrag();
    const from = e.active.data.current as PageDragData | ItemDragData | undefined;
    const to = e.over?.data.current as PageDropData | undefined;
    // A work's drop is heard by PageWorks.
    if (from?.type !== "page" || !to || (to.kind !== "page" && to.kind !== "list")) return;
    dropPage(from.pageId, to.kind === "page" ? { pageId: to.pageId } : { visible: to.visible });
  };

  const draggedPage = dragging?.type === "page" ? pages.find((p) => p.id === dragging.pageId) : null;
  const selected = pages.find((p) => p.id === selectedId) ?? null;

  const lists = (
    <PageOrderLists
      siteId={siteId}
      pages={pages}
      pagesPerGroup={pagesPerGroup}
      selectedId={withWorks ? selectedId : null}
      dropAllowed={() => dragging?.type !== "item"}
      onSelect={withWorks ? selectPage : undefined}
      onAdded={(page) => setPages((prev) => arrangePages([...prev, page]))}
    />
  );

  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-6">
      {error && <p className="mb-2 text-center text-sm text-red-600">{error}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={pageListCollisions}
        onDragStart={(e: DragStartEvent) =>
          setDragging((e.active.data.current as PageDragData | ItemDragData | undefined) ?? null)
        }
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          ignoreClickAfterDrag();
        }}
      >
        {withWorks ? (
          <div className="flex gap-6">
            <div className="min-w-0 flex-1">
              {!selected ? (
                <p className="text-center text-sm text-neutral-400">Choose the page</p>
              ) : (
                <>
                  <h3 className="mb-6 text-center text-lg text-neutral-800">{selected.title}</h3>
                  {!content ? (
                    <p className="text-center text-sm text-neutral-400">Loading…</p>
                  ) : !content.works ? (
                    <p className="text-center text-sm text-neutral-400">This page has no works to arrange.</p>
                  ) : (
                    <PageWorks
                      key={`${selected.id}:${content.load}`}
                      siteId={siteId}
                      artistId={artistId}
                      pageId={selected.id}
                      data={content.works}
                      dragging={dragging}
                      onError={setError}
                      onRemoved={() => loadContent(selected.id)}
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex w-56 shrink-0 flex-col">{lists}</div>
          </div>
        ) : (
          <div className="mx-auto flex w-64 flex-col">{lists}</div>
        )}
        <DragOverlay dropAnimation={null}>
          {draggedPage ? (
            <DraggedPage title={draggedPage.title} />
          ) : dragging?.type === "item" ? (
            <DragThumb url={dragging.url} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
