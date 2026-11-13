"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  getArtistAppPageContent,
  dropArtistAppWork,
  type ArtistAppPage,
  type ArtistAppPageContent,
} from "@/lib/actions/artistApp";
import type { ExhibitionRow } from "@/lib/actions/exhibitions";
import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import { exhibitionDates } from "@/lib/exhibitionDates";
import { setPageComponentItems, setShowcase } from "@/lib/actions/pageComponents";
import { useRouter } from "next/navigation";
import { arrangePages, pageToOpen } from "@/lib/artistAppPageOrder";
import PageOrderLists, {
  DraggedPage,
  pageListCollisions,
  usePageOrder,
  type PageDragData,
  type PageDropData,
} from "@/components/PageOrderLists";
import { moveItem, useArrangeItem, useArrangeReorder, type ItemDragData } from "@/components/arrangeItemDrag";
import CurationWorkPresentationModal from "@/components/CurationWorkPresentationModal";
import ProfileStoryModal, { type GalleryOption } from "@/components/ProfileStoryModal";
import ArtistProfileModal, { type ArtistProfile } from "@/components/artist-app/ArtistProfileModal";
import ExhibitionModal from "@/components/ExhibitionModal";
import ContactPanel from "@/components/ContactPanel";
import ArtworkPicker from "@/components/ArtworkPicker";
import ArtistNewWorkModal from "@/components/artist-app/ArtistNewWorkModal";
import { useClientWords } from "@/components/ClientWordsProvider";
import { addWorksToCuration, removeWorkFromCuration } from "@/lib/actions/curations";
import { LiveSiteData } from "@/lib/siteData";
import { ARTIST_APP_SHOWS_PRESENTATION_MEDIUM, artistAppPageHref } from "@/lib/artistApp";
import { useArtistAppFeatures } from "@/components/artist-app/ArtistAppFeatures";
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
// one-picture page such as Home, it's copied there as its picture). The
// page lists themselves: PageOrderLists.

type DragData = PageDragData | ItemDragData;

export default function ArtistPagesView({
  siteId,
  artistId,
  pages: initialPages,
  firstPageId,
  firstContent,
  galleries,
  profile,
}: {
  siteId: string;
  artistId: string;
  // Arranged (arrangePages).
  pages: ArtistAppPage[];
  firstPageId: string | null;
  firstContent: ArtistAppPageContent | null;
  // For the Galleries entry's window.
  galleries: GalleryOption[];
  // The client's Profile (contact, address, logo) — its tile ends a
  // Profile page's entries (2026-11-11, from the CV screen, removed).
  profile: ArtistProfile;
}) {
  const features = useArtistAppFeatures();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(firstPageId);
  const [content, setContent] = useState(firstContent);
  // Counts loads, so the grid starts afresh with each.
  const [contentLoad, setContentLoad] = useState(0);
  const [loading, setLoading] = useState(false);
  // The work whose Presentation is open, or the Profile entry or
  // exhibition ("new" for Add new Exhibition) whose window is — and
  // whether that exhibition changed, so the page is read again on closing
  // (its order or listing may differ).
  const [presenting, setPresenting] = useState<SiteWork | null>(null);
  const [openStory, setOpenStory] = useState<ProfileStoryRow | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openExhibitionId, setOpenExhibitionId] = useState<string | null>(null);
  const exhibitionChanged = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);

  const sensors = useArtistAppSensors();
  // The frame's list of pages (beside Account, Art manager) follows a new
  // order.
  const { pages, setPages, dropPage } = usePageOrder(siteId, initialPages, {
    onError: setError,
    onSaved: () => router.refresh(),
  });

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
  const draggedPage = dragging?.type === "page" ? pages.find((p) => p.id === dragging.pageId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pageListCollisions}
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
            selected && !loading && content?.kind === "exhibitions" ? (
              <button
                type="button"
                onClick={() => setOpenExhibitionId("new")}
                className="border border-neutral-300 px-6 text-xl text-neutral-800 hover:bg-neutral-50"
              >
                Add new Exhibition
              </button>
            ) : selected && !loading && content?.kind === "arrange" && content.arrange ? (
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
            <PageStories
              stories={content.stories}
              logoUrl={profile.logoUrl}
              onOpen={setOpenStory}
              onOpenProfile={() => setProfileOpen(true)}
            />
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
          <PageOrderLists
            siteId={siteId}
            pages={pages}
            pagesPerGroup={features.pagesPerGroup}
            selectedId={selectedId}
            dropAllowed={(pageId) => dragging?.type !== "item" || takesWork(pageId)}
            onSelect={selectPage}
            onAdded={(page) => {
              setPages((prev) => arrangePages([...prev, page]));
              selectPage(page.id);
              router.refresh();
            }}
          />
        </SidePanel>

        <DragOverlay dropAnimation={null}>
          {draggedPage ? (
            <DraggedPage title={draggedPage.title} />
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
          addPicturesFrom={features.picturesFrom}
          mainReplaceable
          basic
        />
      )}
      {profileOpen && <ArtistProfileModal artist={profile} onClose={() => setProfileOpen(false)} />}
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
      {openExhibitionId && selected && content?.kind === "exhibitions" && (
        <ExhibitionModal
          key={openExhibitionId}
          exhibition={openExhibition}
          artistId={artistId}
          siteId={siteId}
          locations={content.locations}
          addPicturesFrom={features.picturesFrom}
          onLocationAdded={(l) =>
            setContent((c) =>
              c?.kind === "exhibitions"
                ? { ...c, locations: [...c.locations, l].sort((a, b) => a.name.localeCompare(b.name)) }
                : c,
            )
          }
          onSaved={(row) => {
            exhibitionChanged.current = true;
            setContent((c) =>
              c?.kind === "exhibitions"
                ? { ...c, exhibitions: c.exhibitions.map((e) => (e.id === row.id ? row : e)) }
                : c,
            );
          }}
          onDeleted={() => {
            setOpenExhibitionId(null);
            exhibitionChanged.current = false;
            loadContent(selected.id);
          }}
          onClose={() => {
            setOpenExhibitionId(null);
            if (exhibitionChanged.current) loadContent(selected.id);
            exhibitionChanged.current = false;
          }}
        />
      )}
    </>
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
              onClick={() => onOpen(w)}
              onRemove={arrange ? () => remove(w) : undefined}
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
// (Craig, 9 Nov; 13 Nov: the new work form first): the new work form
// (ArtistNewWorkModal) — the work made joins the page's curation, at its
// end — with "Choose existing" opening the artwork picker, whose works
// chosen join it likewise.
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
  const features = useArtistAppFeatures();
  const [step, setStep] = useState<"form" | "choose" | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setStep("form")}
        className="border border-neutral-300 px-3 text-2xl font-light text-neutral-800 hover:bg-neutral-50"
      >
        + {words.items}
      </button>
      {step === "form" && (
        <ArtistNewWorkModal
          siteId={siteId}
          artistId={artistId}
          curationId={curationId}
          onClose={() => setStep(null)}
          onChooseExisting={() => setStep("choose")}
          onAdded={() => {
            setStep(null);
            onAdded();
          }}
        />
      )}
      {step === "choose" && (
        <ArtworkPicker
          artistId={artistId}
          mode="multi"
          allowCreate={false}
          showFilters={features.pickerFilters}
          opened={{ onClose: () => setStep(null) }}
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
      )}
    </>
  );
}

// The Profile entries a page's Profile stories show, in their order, then
// the client's Profile (its logo) — tap for its window.
function PageStories({
  stories,
  logoUrl,
  onOpen,
  onOpenProfile,
}: {
  stories: ProfileStoryRow[];
  logoUrl: string | null;
  onOpen: (s: ProfileStoryRow) => void;
  onOpenProfile: () => void;
}) {
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
      <button type="button" onClick={onOpenProfile} className="block min-w-0 text-left">
        <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-neutral-300 p-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
          )}
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-neutral-800">Profile</p>
      </button>
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
