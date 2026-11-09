"use client";

import { Fragment, useState } from "react";
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
  addArtistAppGroupPage,
  getArtistAppPageContent,
  dropArtistAppWork,
  type ArtistAppPage,
  type ArtistAppPageContent,
} from "@/lib/actions/artistApp";
import type { ExhibitionRow } from "@/lib/actions/exhibitions";
import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import { exhibitionDates } from "@/lib/exhibitionDates";
import { reorderPages } from "@/lib/actions/pages";
import { setPageComponentItems } from "@/lib/actions/pageComponents";
import { arrangePages, movePage, pageToOpen, type PageDrop } from "@/lib/artistAppPageOrder";
import { moveItem, useArrangeItem, useArrangeReorder, type ItemDragData } from "@/components/arrangeItemDrag";
import CurationWorkPresentationModal from "@/components/CurationWorkPresentationModal";
import ProfileStoryModal, { type GalleryOption } from "@/components/ProfileStoryModal";
import ExhibitionModal from "@/components/ExhibitionModal";
import ContactPanel from "@/components/ContactPanel";
import ArtworkPicker from "@/components/ArtworkPicker";
import ArtistNewWorkModal from "@/components/artist-app/ArtistNewWorkModal";
import { useClientWords } from "@/components/ClientWordsProvider";
import { addWorksToCuration, removeWorkFromCuration } from "@/lib/actions/curations";
import { LiveSiteData } from "@/lib/siteData";
import {
  ARTIST_APP_FONT,
  ARTIST_APP_PICKER_FILTERS,
  ARTIST_APP_PICTURES_FROM_FILE,
  ARTIST_APP_SHOWS_PRESENTATION_MEDIUM,
  artistAppPageHref,
} from "@/lib/artistApp";
import { MainPanel, PictureTile, SidePanel, WorkGrid, WorkTile } from "@/components/artist-app/ArtistAppPanels";
import {
  DragThumb,
  TOUCH_DRAG_CLASS,
  ignoreClickAfterDrag,
  useArtistAppSensors,
} from "@/components/artist-app/artistAppDrag";
import type { SiteWork } from "@/lib/siteWorks";

// Arrange Pages (2026-11-08, Craig's mockup): the site's Live and Hidden
// pages (pages under another indented beneath it) beside the chosen
// page's works. Drag a page to reorder it or move it between Live and
// Hidden (rules in lib/artistAppPageOrder.ts); drag a work onto another
// to reorder the page's works — on this page only, where the page allows
// it (see getArtistAppPageContent). On a touch screen, press and hold
// before dragging (useArtistAppSensors). Tapping a work opens its
// Presentation in the curation the page shows it from (Craig, 8 Nov). A
// page without works shows its Profile entries (tap for the entry's
// window), exhibitions or contact form instead (Craig, 9 Nov). A work
// dragged onto another curation page in the lists moves there (onto a
// one-picture page such as Home, it's copied there as its picture). Under a
// group of curation pages, "Add new … page" adds one (a new curation and
// its page, in Hidden — addArtistAppGroupPage).

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
  firstContent,
  galleries,
}: {
  siteId: string;
  artistId: string;
  // Arranged (arrangePages).
  pages: ArtistAppPage[];
  firstPageId: string | null;
  firstContent: ArtistAppPageContent | null;
  // For the Galleries entry's window.
  galleries: GalleryOption[];
}) {
  const [pages, setPages] = useState(initialPages);
  const [selectedId, setSelectedId] = useState(firstPageId);
  const [content, setContent] = useState(firstContent);
  // Counts loads, so the grid starts afresh with each.
  const [contentLoad, setContentLoad] = useState(0);
  const [loading, setLoading] = useState(false);
  // The work whose Presentation is open, or the Profile entry or
  // exhibition whose window is (and whether that exhibition changed, so
  // the page is read again on closing — its order or listing may differ).
  const [presenting, setPresenting] = useState<SiteWork | null>(null);
  const [openStory, setOpenStory] = useState<ProfileStoryRow | null>(null);
  const [openExhibitionId, setOpenExhibitionId] = useState<string | null>(null);
  const [exhibitionChanged, setExhibitionChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);

  const sensors = useArtistAppSensors();

  const loadContent = async (pageId: string) => {
    setLoading(true);
    setError(null);
    try {
      setContent(await getArtistAppPageContent(siteId, pageId));
    } catch {
      setContent(null);
      setError("That page couldn't be loaded.");
    } finally {
      setContentLoad((n) => n + 1);
      setLoading(false);
    }
  };

  const selectPage = (chosenId: string) => {
    const pageId = pageToOpen(pages, chosenId);
    if (pageId === selectedId) return;
    setSelectedId(pageId);
    // Into the address without reloading (see the page's route).
    window.history.replaceState(null, "", artistAppPageHref(siteId, pageId));
    loadContent(pageId);
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
    ignoreClickAfterDrag();
    const from = e.active.data.current as DragData | undefined;
    const to = e.over?.data.current as PageDropData | undefined;
    if (!from || !to) return;
    if (from.type === "page") {
      dropPage(from.pageId, to.kind === "page" ? { pageId: to.pageId } : { visible: to.visible });
    } else if (to.kind === "page" && takesWork(to.pageId)) {
      dropWork(from.itemId, to.pageId);
    }
  };

  // A work can be dragged from an arrangeable page onto another page in
  // the lists that shows a curation (Craig, 9 Nov) — moved there, or
  // copied onto a one-picture page such as Home as its picture
  // (dropArtistAppWork).
  const takesWork = (pageId: string) =>
    content?.kind === "arrange" && pageId !== selectedId && !!pages.find((p) => p.id === pageId)?.hasCuration;

  const dropWork = async (artworkId: string, toPageId: string) => {
    if (content?.kind !== "arrange" || !content.arrange || !selectedId) return;
    setError(null);
    const result = await dropArtistAppWork(siteId, content.arrange.curationId, toPageId, artworkId).catch(() => ({
      error: "The work wasn't moved — please try again.",
    }));
    if ("error" in result) setError(result.error);
    else if (!result.copied) loadContent(selectedId);
  };

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const openExhibition =
    content?.kind === "exhibitions" ? (content.exhibitions.find((e) => e.id === openExhibitionId) ?? null) : null;
  const titleOf = (id: string | null) => pages.find((p) => p.id === id)?.title ?? "";
  const draggedPage = dragging?.type === "page" ? pages.find((p) => p.id === dragging.pageId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as DragData | undefined) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          ignoreClickAfterDrag();
        }}
      >
        <MainPanel
          heading={selected?.title ?? "Pages"}
          aside={
            selected && !loading && content?.kind === "arrange" && content.arrange ? (
              <AddWorks
                siteId={siteId}
                artistId={artistId}
                curationId={content.arrange.curationId}
                excludeIds={[...content.works.map((w) => w.artworkId), ...content.arrange.hiddenIds]}
                onAdded={() => loadContent(selected.id)}
                onError={setError}
              />
            ) : null
          }
        >
          {loading ? (
            <p className="text-center text-neutral-400">Loading…</p>
          ) : !selected || !content ? null : content.kind === "stories" ? (
            <PageStories stories={content.stories} onOpen={setOpenStory} />
          ) : content.kind === "exhibitions" ? (
            <PageExhibitions exhibitions={content.exhibitions} onOpen={setOpenExhibitionId} />
          ) : content.kind === "contact" ? (
            // The form as the site shows it (messages are only sent from
            // the published site).
            <div className="mx-auto max-w-xl overflow-hidden rounded-sm border border-neutral-200">
              <LiveSiteData siteId={siteId} artistId={artistId}>
                <ContactPanel settings={content.settings} onClosed={() => {}} inline />
              </LiveSiteData>
            </div>
          ) : (
            <PageWorks
              key={`${selected.id}:${contentLoad}`}
              siteId={siteId}
              artistId={artistId}
              pageId={selected.id}
              data={content}
              dragging={dragging}
              onError={setError}
              onOpen={setPresenting}
              onRemoved={() => loadContent(selected.id)}
            />
          )}
        </MainPanel>

        <SidePanel>
          {error && <p className="px-1 text-sm text-red-600">{error}</p>}
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
                        dropAllowed={dragging?.type !== "item" || takesWork(p.id)}
                        selected={p.id === selectedId}
                        under={p.parentId && !parentHere ? titleOf(p.parentId) : null}
                        onSelect={() => selectPage(p.id)}
                      />
                      {addTo && (
                        <AddGroupPage
                          siteId={siteId}
                          groupId={addTo}
                          groupTitle={titleOf(addTo)}
                          onAdded={(page) => {
                            setPages((prev) => arrangePages([...prev, page]));
                            selectPage(page.id);
                          }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </PageList>
            );
          })}
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
          onArtworkChanged={() => loadContent(selected.id)}
          showMedium={ARTIST_APP_SHOWS_PRESENTATION_MEDIUM}
          addPicturesFrom={ARTIST_APP_PICTURES_FROM_FILE ? "file" : "catalogue"}
          mainReplaceable
          basic
        />
      )}
      {openStory && selected && (
        <ProfileStoryModal
          key={openStory.id}
          story={openStory}
          artistId={artistId}
          siteId={siteId}
          galleries={galleries}
          onClose={() => setOpenStory(null)}
          onSaved={(row) => {
            setOpenStory(row);
            setContent((c) =>
              c?.kind === "stories" ? { ...c, stories: c.stories.map((s) => (s.id === row.id ? row : s)) } : c,
            );
          }}
          onDeleted={() => {
            setOpenStory(null);
            loadContent(selected.id);
          }}
        />
      )}
      {openExhibition && selected && content?.kind === "exhibitions" && (
        <ExhibitionModal
          key={openExhibition.id}
          exhibition={openExhibition}
          artistId={artistId}
          siteId={siteId}
          locations={content.locations}
          addPicturesFrom={ARTIST_APP_PICTURES_FROM_FILE ? "file" : "catalogue"}
          onLocationAdded={(l) =>
            setContent((c) =>
              c?.kind === "exhibitions"
                ? { ...c, locations: [...c.locations, l].sort((a, b) => a.name.localeCompare(b.name)) }
                : c,
            )
          }
          onSaved={(row) => {
            setExhibitionChanged(true);
            setContent((c) =>
              c?.kind === "exhibitions"
                ? { ...c, exhibitions: c.exhibitions.map((e) => (e.id === row.id ? row : e)) }
                : c,
            );
          }}
          onDeleted={() => {
            setOpenExhibitionId(null);
            setExhibitionChanged(false);
            loadContent(selected.id);
          }}
          onClose={() => {
            setOpenExhibitionId(null);
            if (exhibitionChanged) loadContent(selected.id);
            setExhibitionChanged(false);
          }}
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

// A group whose pages all show a curation (e.g. portfolio) can have more
// added.
function addsPages(pages: ArtistAppPage[], groupId: string): boolean {
  const group = pages.find((p) => p.id === groupId);
  const children = pages.filter((p) => p.parentId === groupId);
  return !!group && !group.parentId && children.length > 0 && children.every((c) => c.hasCuration);
}

// "Add new … page": tapped, a name box and Add (Enter); see
// addArtistAppGroupPage.
function AddGroupPage({
  siteId,
  groupId,
  groupTitle,
  onAdded,
}: {
  siteId: string;
  groupId: string;
  groupTitle: string;
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
  // What's being dragged can be dropped here (a page always; a work only
  // onto a page it can move to).
  dropAllowed: boolean;
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

// The chosen page's works; dragged into a new order where the page
// allows it (or, with one picture, another chosen in its place), saved
// for this page only.
function PageWorks({
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
  dragging: DragData | null;
  onError: (message: string | null) => void;
  // A work tapped: its Presentation, in the curation it's shown from.
  onOpen: (work: SiteWork) => void;
  // After "Remove work" (the page's content is loaded afresh).
  onRemoved: () => void;
}) {
  const [works, setWorks] = useState(data.works);
  const arrange = data.arrange;

  // Saves the works' new order for this page.
  const saveOrder = async (next: SiteWork[]) => {
    if (!arrange) return;
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
  };
  const move = (fromId: string, toId: string) => {
    const next = moveItem(works, (w) => w.artworkId, fromId, toId);
    if (next) saveOrder(next);
  };

  useArrangeReorder(data.kind === "arrange" && arrange ? arrange.blockId : "", move);

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
          <WorkTile hideNumber work={shown} onClick={() => onOpen(shown)} className="cursor-pointer" />
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
      {data.kind !== "arrange" && (
        <p className="-mt-4 mb-6 text-center text-sm text-neutral-400">
          {data.kind === "showcase"
            ? "This page shows the site's works in a new order on every visit."
            : "The order of this page's works can't be changed here."}
        </p>
      )}
      <WorkGrid>
        {works.map((w, i) =>
          data.kind === "arrange" && arrange ? (
            <DraggableWork
              key={w.artworkId}
              blockId={arrange.blockId}
              work={w}
              dragging={dragging}
              onClick={() => onOpen(w)}
              onRemove={() => remove(w)}
            />
          ) : (
            <WorkTile
              key={`${w.artworkId}:${i}`}
              hideNumber
              work={w}
              onClick={() => onOpen(w)}
              className="cursor-pointer"
            />
          ),
        )}
      </WorkGrid>
    </>
  );
}

// "+ Works" beside the heading of a page whose works can be arranged
// (Craig, 9 Nov): the artwork picker; the works chosen join the page's
// curation, at its end. Its "Add new work" makes a new one there
// (ArtistNewWorkModal), then closes the picker.
function AddWorks({
  siteId,
  artistId,
  curationId,
  excludeIds,
  onAdded,
  onError,
}: {
  siteId: string;
  artistId: string;
  curationId: string;
  // Already in the curation.
  excludeIds: string[];
  onAdded: () => void;
  onError: (message: string | null) => void;
}) {
  const words = useClientWords();
  // "Add new work" open, with the way to close the picker under it.
  const [newWork, setNewWork] = useState<{ closePicker: () => void } | null>(null);
  return (
    <>
      <ArtworkPicker
        artistId={artistId}
        mode="multi"
        variant="button"
        label={`+ ${words.items}`}
        triggerClassName="border border-neutral-300 px-3 text-2xl font-light text-neutral-800 hover:bg-neutral-50"
        allowCreate={false}
        showFilters={ARTIST_APP_PICKER_FILTERS}
        headerAction={(closePicker) => (
          <button
            type="button"
            onClick={() => setNewWork({ closePicker })}
            className="rounded-md border border-neutral-300 px-6 py-2 text-base text-neutral-900 hover:bg-neutral-50"
            style={{ fontFamily: ARTIST_APP_FONT }}
          >
            Add new {words.item.toLowerCase()}
          </button>
        )}
        excludeIds={excludeIds}
        onSelect={async (picked) => {
          if (picked.length === 0) return;
          onError(null);
          const result = await addWorksToCuration(
            curationId,
            artistId,
            picked.map((a) => a.id),
          ).catch(() => ({ error: "" }));
          if ("error" in result) onError(`The ${words.items.toLowerCase()} weren't added — please try again.`);
          else onAdded();
        }}
      />
      {newWork && (
        <ArtistNewWorkModal
          siteId={siteId}
          artistId={artistId}
          curationId={curationId}
          onClose={() => setNewWork(null)}
          onAdded={() => {
            newWork.closePicker();
            setNewWork(null);
            onAdded();
          }}
        />
      )}
    </>
  );
}

// The Profile entries a page's Profile stories show, in their order.
function PageStories({ stories, onOpen }: { stories: ProfileStoryRow[]; onOpen: (s: ProfileStoryRow) => void }) {
  if (stories.length === 0) return <p className="text-center text-neutral-400">Nothing on this page yet</p>;
  return (
    <WorkGrid>
      {stories.map((s) => (
        <PictureTile
          key={s.id}
          url={s.media?.thumbUrl ?? null}
          video={s.media?.kind === "VIDEO"}
          label={s.caption || "Untitled"}
          onClick={() => onOpen(s)}
        />
      ))}
    </WorkGrid>
  );
}

// The exhibitions a page shows, as it lists them; a tap opens its window
// (ExhibitionModal, as in the admin — 2026-11-09).
function PageExhibitions({
  exhibitions,
  onOpen,
}: {
  exhibitions: ExhibitionRow[];
  onOpen: (id: string) => void;
}) {
  if (exhibitions.length === 0) return <p className="text-center text-neutral-400">No exhibitions yet</p>;
  return (
    <WorkGrid>
      {exhibitions.map((e) => (
        <PictureTile
          key={e.id}
          url={e.images[0]?.url ?? null}
          video={e.images[0]?.kind === "VIDEO"}
          label={e.name || e.venue?.name || "Untitled"}
          detail={exhibitionDates(e.startDate, e.endDate)}
          onClick={() => onOpen(e.id)}
        />
      ))}
    </WorkGrid>
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
  dragging: DragData | null;
  onClick: () => void;
  onRemove: () => void;
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
      }
      className={`cursor-grab ${TOUCH_DRAG_CLASS} ${drag.isDragging ? "opacity-30" : ""} ${
        drag.target ? "outline outline-4 outline-neutral-400" : ""
      }`}
    />
  );
}
