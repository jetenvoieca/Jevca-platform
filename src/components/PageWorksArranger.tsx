"use client";

import { useState } from "react";
import type { ArtistAppPageContent } from "@/lib/actions/artistApp";
import { setPageComponentItems, setShowcase } from "@/lib/actions/pageComponents";
import { removeWorkFromCuration } from "@/lib/actions/curations";
import { moveItem, useArrangeItem, useArrangeReorder } from "@/components/arrangeItemDrag";
import { WorkGrid, WorkTile } from "@/components/artist-app/ArtistAppPanels";
import { TOUCH_DRAG_CLASS } from "@/components/artist-app/artistAppDrag";
import type { SiteWork } from "@/lib/siteWorks";

// A page's works (2026-11-08, Craig's mockup), shared by the Artist App's
// Arrange Pages and Administration → Concierge's "Rearrange artworks on a
// page" (2026-11-13). Must sit inside a DndContext (works are reordered
// through useArrangeReorder).

// The chosen page's works; dragged into a new order where the page
// allows it (or, with one picture, another chosen in its place), saved
// for this page only.
export default function PageWorks({
  siteId,
  artistId,
  pageId,
  data,
  dragging,
  onError,
  onOpen,
  onRemoved,
}: {
  siteId: string;
  artistId: string;
  pageId: string;
  data: Extract<ArtistAppPageContent, { works: SiteWork[] }>;
  // What's being dragged in the surrounding DndContext.
  dragging: { type: string } | null;
  onError: (message: string | null) => void;
  // A work tapped: its Presentation, in the curation it's shown from
  // (none in Administration → Concierge).
  onOpen?: (work: SiteWork) => void;
  // After "Remove work" (the page's content is loaded afresh).
  onRemoved: () => void;
}) {
  const [works, setWorks] = useState(data.works);
  const arrange = data.arrange;
  // A Showcase page (2026-11-12, Craig): its works dragged into order,
  // used on the website when Shuffle is off.
  const showcase = data.kind === "showcase" ? data.showcase : undefined;
  const [shuffle, setShuffle] = useState(showcase?.shuffle ?? true);
  const orderBlock = arrange?.blockId ?? showcase?.blockId ?? "";

  // Saves the works' new order for this page.
  const saveOrder = async (next: SiteWork[]) => {
    if (!orderBlock) return;
    const before = works;
    setWorks(next);
    onError(null);
    const orderIds = next.map((w) => w.artworkId);
    const result = await (arrange
      ? setPageComponentItems(siteId, pageId, arrange.blockId, { hiddenIds: arrange.hiddenIds, orderIds })
      : setShowcase(siteId, pageId, orderBlock, { orderIds })
    ).catch(() => ({ error: "" }));
    if ("error" in result) {
      setWorks(before);
      onError("The works' new order wasn't saved.");
    }
  };
  const move = (fromId: string, toId: string) => {
    const next = moveItem(works, (w) => w.artworkId, fromId, toId);
    if (next) saveOrder(next);
  };

  useArrangeReorder((data.kind === "arrange" && arrange) || showcase ? orderBlock : "", move);

  const switchShuffle = async (on: boolean) => {
    if (!showcase) return;
    setShuffle(on);
    onError(null);
    const result = await setShowcase(siteId, pageId, showcase.blockId, { shuffle: on }).catch(() => ({ error: "" }));
    if ("error" in result) {
      setShuffle(!on);
      onError("That wasn't saved.");
    }
  };

  // "Remove work" (Craig, 9 Nov): out of the page's curation, after a
  // check — the work itself stays in the Catalogue.
  const remove = async (work: SiteWork) => {
    if (!arrange) return;
    if (!confirm(`Remove "${work.catalogueName}" from this page? It stays in your catalogue.`)) return;
    const before = works;
    setWorks(works.filter((w) => w.artworkId !== work.artworkId));
    onError(null);
    const result = await removeWorkFromCuration(arrange.curationId, artistId, work.artworkId).catch(() => ({
      error: "",
    }));
    if ("error" in result) {
      setWorks(before);
      onError("The work wasn't removed — please try again.");
    } else onRemoved();
  };

  if (works.length === 0) return <p className="text-center text-neutral-400">No works on this page</p>;

  // One picture on the page (Craig, 8 Nov): the work shown, then the
  // curation's others — tapping one shows it instead.
  if (data.kind === "single") {
    const [shown, ...others] = works;
    return (
      <>
        <WorkGrid>
          <WorkTile hideNumber work={shown} onClick={onOpen && (() => onOpen(shown))} className={onOpen ? "cursor-pointer" : ""} />
        </WorkGrid>
        <p className="mt-2 text-sm text-neutral-400">On the page</p>
        {others.length > 0 && (
          <>
            <p className="mb-6 mt-10 text-center text-sm text-neutral-400">
              The curation&rsquo;s other works — tap one to show it instead
            </p>
            <WorkGrid>
              {others.map((w) => (
                <WorkTile
                  key={w.artworkId}
                  hideNumber
                  work={w}
                  onClick={() => move(w.artworkId, shown.artworkId)}
                  className="cursor-pointer opacity-80 hover:opacity-100"
                />
              ))}
            </WorkGrid>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {showcase ? (
        <div className="-mt-4 mb-6 flex flex-col items-center gap-1 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
            <input type="checkbox" checked={shuffle} onChange={(e) => switchShuffle(e.target.checked)} className="h-4 w-4" />
            Shuffle
          </label>
          <p className="text-neutral-400">
            {shuffle
              ? "The site's works show in a new order on every visit."
              : "The site's works show in this order — drag them to change it. New works go at the end."}
          </p>
        </div>
      ) : (
        data.kind !== "arrange" && (
          <p className="-mt-4 mb-6 text-center text-sm text-neutral-400">
            The order of this page&apos;s works can&apos;t be changed here.
          </p>
        )
      )}
      <WorkGrid>
        {works.map((w, i) =>
          (data.kind === "arrange" && arrange) || showcase ? (
            <DraggableWork
              key={w.artworkId}
              blockId={orderBlock}
              work={w}
              dragging={dragging}
              onClick={onOpen && (() => onOpen(w))}
              onRemove={arrange ? () => remove(w) : undefined}
            />
          ) : (
            <WorkTile
              key={`${w.artworkId}:${i}`}
              hideNumber
              work={w}
              onClick={onOpen && (() => onOpen(w))}
              className={onOpen ? "cursor-pointer" : ""}
            />
          ),
        )}
      </WorkGrid>
    </>
  );
}

function DraggableWork({
  blockId,
  work,
  dragging,
  onClick,
  onRemove,
}: {
  blockId: string;
  work: SiteWork;
  dragging: { type: string } | null;
  onClick?: () => void;
  // "Remove work" — none on a Showcase.
  onRemove?: () => void;
}) {
  const drag = useArrangeItem(blockId, work.artworkId, work.imageUrl, dragging);
  return (
    <WorkTile
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onClick}
      work={work}
      aside={
        onRemove && (
        <button
          type="button"
          // Not a drag, and not the tile's tap.
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 text-sm text-neutral-400 hover:text-neutral-700"
        >
          Remove work
        </button>
        )
      }
      className={`cursor-grab ${TOUCH_DRAG_CLASS} ${drag.isDragging ? "opacity-30" : ""} ${
        drag.target ? "outline outline-4 outline-neutral-400" : ""
      }`}
    />
  );
}
