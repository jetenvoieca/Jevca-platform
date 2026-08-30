"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveDraftBlocks, deletePage, menuItemCountForPage, updatePageTitle } from "@/lib/actions/pages";
import {
  createPavilionChildPage,
  renamePavilionChildPage,
  deletePavilionChildPage,
} from "@/lib/actions/pavilions";
import { nextCardPosition, nextCuratorPosition } from "@/lib/pavilionLayout";
import PavilionCanvas from "@/components/PavilionCanvas";
import MediaPicker from "@/components/MediaPicker";
import ArtistSelectorModal from "@/components/ArtistSelectorModal";
import type { PavilionCard, PavilionCurator, PavilionCuratorArtist, PavilionTile } from "@/lib/blocks";

const MAX_CURATORS = 9;

// Fixed "you are here" spot for whichever level is drilled into
// (2026-08-30) — deliberately NOT that item's real x/y/width/height
// (that position is specific to the level above, where several
// siblings sit side by side, and could be anywhere). Rendered as a
// separate, static, non-draggable element outside PavilionCanvas
// entirely — it's context, not a tile to be rearranged — while whatever
// is one level down is the only thing PavilionCanvas itself renders/
// drags/resizes.
const DRILL_MARKER = { left: "2%", top: "2%", width: "18%", height: "20%" };

// Its own two-column layout, not the generic ThreeColumnShell used by
// PageEditor/SectionEditor — deliberately tight, since the panel needs
// to stay compact as more content lands in it, and the canvas needs to
// be able to go full-width via the expand toggle.
//
// Root is h-full so the canvas can genuinely fill the available page
// height rather than only its own content's height — the site's own
// layout.tsx already gives this component's slot a bounded, scrollable
// height (its "independently scrolling columns" convention), this just
// opts into it. Left (canvas) and right (list) columns each scroll
// independently within that height.
//
// Curators drill one level deeper within the same right-hand column: a
// Pavilion's expanded fields show a compact list of its Curators (name
// only); clicking one, or "Add Curator", swaps to that Curator's own
// Name/Image/Description/Save/Delete form (plus an Artist selector) —
// the identical template used for a Pavilion itself — with a "← Back"
// to return.
//
// Drilling on the canvas itself (2026-08-30, matching
// PavilionVisualEditor) — while the panel is collapsed (full-width
// canvas), clicking a tile goes one level deeper each time: all
// Pavilions → one Pavilion's Curators → one Curator's Artists (real
// platform Artists ticked via the picker, shown as plain-name
// placeholder cards for now). Whichever item you drilled into becomes
// the fixed marker, top-left; clicking it goes back up one level.
// While the panel is open, clicking a tile still opens/selects it for
// editing as before — drilling is specifically a full-screen-mode
// behaviour.
export default function PavilionEditor({
  siteId,
  artistId,
  pageId,
  pageTitle,
  initialCards,
}: {
  siteId: string;
  artistId: string;
  pageId: string;
  pageTitle: string;
  initialCards: PavilionCard[];
}) {
  const [cards, setCards] = useState<PavilionCard[]>(initialCards);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  // "new" while a blank row is open ready to be filled in; a card's own
  // id while that row is open; null when every row is collapsed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageId, setDraftImageId] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCurators, setDraftCurators] = useState<PavilionCurator[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Collapses the right panel entirely and gives the canvas the full
  // width — toggled from the small corner button on the canvas itself,
  // not a separate "Open full preview" page/tab.
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Curator sub-editor state — "new" or an existing curator's index
  // while drilled into a Curator's own form; null while showing the
  // Pavilion-level fields.
  const [curatorEditingIndex, setCuratorEditingIndex] = useState<number | "new" | null>(null);
  const [draftCuratorName, setDraftCuratorName] = useState("");
  const [draftCuratorDescription, setDraftCuratorDescription] = useState("");
  const [draftCuratorImageId, setDraftCuratorImageId] = useState("");
  const [draftCuratorImageUrl, setDraftCuratorImageUrl] = useState("");
  const [draftCuratorArtists, setDraftCuratorArtists] = useState<PavilionCuratorArtist[]>([]);
  const [artistPickerOpen, setArtistPickerOpen] = useState(false);

  // Full-screen (panel-collapsed) drill state — which Pavilion, and (one
  // level further) which of its Curators, are being shown on the canvas
  // instead of the level above.
  const [drilledPavilionId, setDrilledPavilionId] = useState<string | null>(null);
  const [drilledCuratorId, setDrilledCuratorId] = useState<string | null>(null);

  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Autosaves the whole cards array — covers both drag/resize on the
  // canvas and any card content change, same debounced pattern already
  // used for Section/Content-Block pages.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveDraftBlocks(pageId, { cards });
      setSaveState("saved");
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const handleRenamePage = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === pageTitle) return;
    const fd = new FormData();
    fd.set("title", trimmed);
    updatePageTitle(pageId, siteId, fd).then(() => {
      router.refresh();
      setTitleSaved(true);
      setTimeout(() => setTitleSaved(false), 1500);
    });
  };

  const handleDeletePage = async () => {
    setIsDeleting(true);
    const menuCount = await menuItemCountForPage(pageId);
    const warning =
      menuCount > 0
        ? `"${pageTitle}" is used in ${menuCount} menu placement${
            menuCount === 1 ? "" : "s"
          } — deleting it will remove those too. `
        : "";
    if (!confirm(`${warning}Delete "${pageTitle}"? This can't be undone.`)) {
      setIsDeleting(false);
      return;
    }
    await deletePage(siteId, pageId);
  };

  const drilledCard =
    panelCollapsed && drilledPavilionId ? cards.find((c) => c.id === drilledPavilionId) ?? null : null;
  const drilledCurator =
    drilledCard && drilledCuratorId
      ? drilledCard.curators.find((c) => c.id === drilledCuratorId) ?? null
      : null;

  const markerItem: PavilionTile | null = drilledCurator ?? drilledCard;
  const visibleTiles: PavilionTile[] = drilledCurator
    ? drilledCurator.artists.map((a) => ({
        id: a.id,
        name: a.name,
        description: "",
        imageUrl: "",
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      }))
    : drilledCard
      ? drilledCard.curators.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
        }))
      : cards;

  // Live position/size updates from the canvas — routed to whichever
  // nesting level is currently drilled into.
  const handleCardChange = (
    id: string,
    patch: Partial<Pick<PavilionTile, "x" | "y" | "width" | "height">>
  ) => {
    if (drilledCurator && drilledCard) {
      setCards((prev) =>
        prev.map((c) =>
          c.id !== drilledCard.id
            ? c
            : {
                ...c,
                curators: c.curators.map((cur) =>
                  cur.id !== drilledCurator.id
                    ? cur
                    : { ...cur, artists: cur.artists.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
                ),
              }
        )
      );
      return;
    }
    if (drilledCard) {
      setCards((prev) =>
        prev.map((c) =>
          c.id === drilledCard.id
            ? { ...c, curators: c.curators.map((cur) => (cur.id === id ? { ...cur, ...patch } : cur)) }
            : c
        )
      );
      return;
    }
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const openNewCardForm = () => {
    setEditingId("new");
    setDraftName("");
    setDraftDescription("");
    setDraftImageId("");
    setDraftImageUrl("");
    setDraftCurators([]);
    setCuratorEditingIndex(null);
  };

  const handleMarkerClick = () => {
    if (drilledCuratorId) {
      setDrilledCuratorId(null);
      return;
    }
    setDrilledPavilionId(null);
  };

  // Clicking a tile — while the panel is open, this opens/selects it for
  // editing as before (list-row behaviour). While the panel is
  // collapsed (full-screen canvas), this drills one level deeper each
  // time, or is a no-op on an Artist card.
  const toggleCard = (id: string) => {
    if (!panelCollapsed) {
      if (editingId === id) {
        setEditingId(null);
        return;
      }
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      setEditingId(id);
      setDraftName(card.name);
      setDraftDescription(card.description);
      setDraftImageId(card.imageId);
      setDraftImageUrl(card.imageUrl);
      setDraftCurators(card.curators ?? []);
      setCuratorEditingIndex(null);
      return;
    }

    if (drilledCurator) return; // Artist card — no-op for now.
    if (drilledCard) {
      setDrilledCuratorId(id);
      return;
    }
    setDrilledPavilionId(id);
  };

  const handleSaveCard = async () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) return;
    setIsSaving(true);

    if (editingId === "new") {
      const childPage = await createPavilionChildPage(siteId, trimmedName);
      if (!childPage) {
        setIsSaving(false);
        return;
      }
      const position = nextCardPosition(cards.length);
      const newCard: PavilionCard = {
        id: crypto.randomUUID(),
        name: trimmedName,
        description: draftDescription.trim(),
        imageId: draftImageId,
        imageUrl: draftImageUrl,
        childPageId: childPage.id,
        curators: draftCurators,
        ...position,
      };
      setCards((prev) => [...prev, newCard]);
    } else if (editingId) {
      const existing = cards.find((c) => c.id === editingId);
      if (existing && existing.name !== trimmedName) {
        await renamePavilionChildPage(existing.childPageId, siteId, trimmedName);
      }
      setCards((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: trimmedName,
                description: draftDescription.trim(),
                imageId: draftImageId,
                imageUrl: draftImageUrl,
                curators: draftCurators,
              }
            : c
        )
      );
    }

    setIsSaving(false);
    setEditingId(null);
  };

  const handleDeleteCard = async () => {
    if (!editingId || editingId === "new") {
      setEditingId(null);
      return;
    }
    const existing = cards.find((c) => c.id === editingId);
    if (!existing) return;
    if (!confirm(`Delete "${existing.name || "this Pavilion"}"? This can't be undone.`)) return;
    setIsSaving(true);
    await deletePavilionChildPage(existing.childPageId, siteId);
    setCards((prev) => prev.filter((c) => c.id !== editingId));
    setIsSaving(false);
    setEditingId(null);
  };

  // ---- Curator sub-editor (drills into the same expanded-row space) ----

  const openNewCuratorForm = () => {
    if (draftCurators.length >= MAX_CURATORS) return;
    setCuratorEditingIndex("new");
    setDraftCuratorName("");
    setDraftCuratorDescription("");
    setDraftCuratorImageId("");
    setDraftCuratorImageUrl("");
    setDraftCuratorArtists([]);
  };

  const openExistingCurator = (index: number) => {
    const c = draftCurators[index];
    if (!c) return;
    setCuratorEditingIndex(index);
    setDraftCuratorName(c.name);
    setDraftCuratorDescription(c.description);
    setDraftCuratorImageId(c.imageId);
    setDraftCuratorImageUrl(c.imageUrl);
    setDraftCuratorArtists(c.artists ?? []);
  };

  const toggleCuratorArtist = (artist: { id: string; name: string }) => {
    setDraftCuratorArtists((prev) => {
      const exists = prev.some((a) => a.artistId === artist.id);
      if (exists) return prev.filter((a) => a.artistId !== artist.id);
      const position = nextCuratorPosition(prev.length);
      return [
        ...prev,
        { id: crypto.randomUUID(), artistId: artist.id, name: artist.name, description: "", imageUrl: "", ...position },
      ];
    });
  };

  const handleSaveCurator = () => {
    const trimmedName = draftCuratorName.trim();
    if (!trimmedName) return;
    if (curatorEditingIndex === "new") {
      const position = nextCuratorPosition(draftCurators.length);
      setDraftCurators((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: trimmedName,
          description: draftCuratorDescription.trim(),
          imageId: draftCuratorImageId,
          imageUrl: draftCuratorImageUrl,
          artists: draftCuratorArtists,
          ...position,
        },
      ]);
    } else if (curatorEditingIndex !== null) {
      const index = curatorEditingIndex;
      setDraftCurators((prev) =>
        prev.map((c, i) =>
          i === index
            ? {
                ...c,
                name: trimmedName,
                description: draftCuratorDescription.trim(),
                imageId: draftCuratorImageId,
                imageUrl: draftCuratorImageUrl,
                artists: draftCuratorArtists,
              }
            : c
        )
      );
    }
    setCuratorEditingIndex(null);
  };

  const handleDeleteCurator = () => {
    if (curatorEditingIndex === "new" || curatorEditingIndex === null) {
      setCuratorEditingIndex(null);
      return;
    }
    const index = curatorEditingIndex;
    setDraftCurators((prev) => prev.filter((_, i) => i !== index));
    setCuratorEditingIndex(null);
  };

  const renderCuratorForm = () => (
    <div className="mt-2 space-y-3 pl-1">
      <button
        type="button"
        onClick={() => setCuratorEditingIndex(null)}
        className="text-sm text-neutral-500 hover:underline"
      >
        ← Back to {draftName || "Pavilion"}
      </button>

      <input
        type="text"
        value={draftCuratorName}
        onChange={(e) => setDraftCuratorName(e.target.value)}
        placeholder="Name"
        autoFocus
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      {/* Artists — real platform Artists ticked via the picker;
          drilling into this Curator on the canvas shows these as
          placeholder cards. */}
      <div className="space-y-1.5">
        {draftCuratorArtists.map((a) => (
          <p
            key={a.id}
            className="truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600"
          >
            {a.name}
          </p>
        ))}
        <button
          type="button"
          onClick={() => setArtistPickerOpen(true)}
          className="text-xs font-medium uppercase tracking-wide text-neutral-400 hover:text-neutral-700"
        >
          Select Artists{draftCuratorArtists.length > 0 ? ` (${draftCuratorArtists.length})` : ""}
        </button>
      </div>

      <MediaPicker
        artistId={artistId}
        siteId={siteId}
        mode="single"
        previewUrl={draftCuratorImageUrl || undefined}
        label="Add Image"
        onSelect={(imgs) => {
          setDraftCuratorImageId(imgs[0].id);
          setDraftCuratorImageUrl(imgs[0].url);
        }}
      />

      <textarea
        value={draftCuratorDescription}
        onChange={(e) => setDraftCuratorDescription(e.target.value)}
        placeholder="Description"
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSaveCurator}
          disabled={!draftCuratorName.trim()}
          className="flex-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleDeleteCurator}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );

  const renderExpandedFields = () => (
    <div className="mt-2 space-y-3 pl-1">
      {/* Curators — a compact list of names, each opening its own full
          Name/Image/Description form on click, same template as this
          Pavilion's own fields. */}
      <div className="space-y-1.5">
        {draftCurators.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openExistingCurator(i)}
            className="w-full truncate rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
          >
            {c.name || "Untitled Curator"}
          </button>
        ))}
        <button
          type="button"
          onClick={openNewCuratorForm}
          disabled={draftCurators.length >= MAX_CURATORS}
          className="text-xs font-medium uppercase tracking-wide text-neutral-400 hover:text-neutral-700 disabled:opacity-40"
        >
          Add Curator{draftCurators.length > 0 ? ` (${draftCurators.length}/${MAX_CURATORS})` : ""}
        </button>
      </div>

      {/* Large, uncropped-to-a-tiny-box clickable preview — the image
          itself is the trigger to change it, via MediaPicker's
          previewUrl prop. */}
      <MediaPicker
        artistId={artistId}
        siteId={siteId}
        mode="single"
        previewUrl={draftImageUrl || undefined}
        label="Add Image"
        onSelect={(imgs) => {
          setDraftImageId(imgs[0].id);
          setDraftImageUrl(imgs[0].url);
        }}
      />

      <textarea
        value={draftDescription}
        onChange={(e) => setDraftDescription(e.target.value)}
        placeholder="Description"
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSaveCard}
          disabled={isSaving || !draftName.trim()}
          className="flex-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleDeleteCard}
          disabled={isSaving}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`h-full ${
        panelCollapsed ? "grid grid-cols-1" : "grid grid-cols-[1fr_300px] gap-0"
      }`}
    >
      <div className="relative h-full overflow-y-auto border-r border-neutral-200 bg-neutral-50 p-6">
        <button
          type="button"
          onClick={() => {
            setPanelCollapsed((v) => !v);
            setDrilledPavilionId(null);
            setDrilledCuratorId(null);
          }}
          title={panelCollapsed ? "Show panel" : "Expand canvas"}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50"
        >
          {panelCollapsed ? "⤡" : "⤢"}
        </button>

        {/* Fixed "you are here" marker for whichever level is drilled
            into — not a canvas tile. Click to go back up one level. */}
        {markerItem && (
          <button
            type="button"
            onClick={handleMarkerClick}
            title="Go back"
            style={DRILL_MARKER}
            className="absolute z-10 flex flex-col overflow-hidden rounded-lg border-2 border-neutral-900 bg-white text-left shadow-md"
          >
            <p className="truncate px-2 pt-1.5 text-center text-xs font-medium text-neutral-600">
              {markerItem.name || "Untitled"}
            </p>
            <div className="flex-1 overflow-hidden px-2 py-1">
              {markerItem.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={markerItem.imageUrl} alt="" className="h-full w-full rounded object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded bg-neutral-100 text-[10px] text-neutral-400">
                  No image
                </div>
              )}
            </div>
          </button>
        )}

        <PavilionCanvas
          cards={visibleTiles}
          onCardClick={toggleCard}
          onCardChange={handleCardChange}
          emptyMessage={
            drilledCurator
              ? "No Artists selected yet — tick some in this Curator's edit form."
              : drilledCard
                ? "No Curators yet — open the panel to add one."
                : "Add your first Pavilion using the panel on the right."
          }
        />
      </div>

      {!panelCollapsed && (
        <div className="h-full overflow-y-auto p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <input
              type="text"
              defaultValue={pageTitle}
              onBlur={(e) => handleRenamePage(e.target.value)}
              className="w-1/2 rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
            />
            <button
              type="button"
              onClick={openNewCardForm}
              className="text-xs font-medium uppercase tracking-wide text-neutral-500 hover:text-neutral-900"
            >
              Add Pavilion
            </button>
          </div>
          {titleSaved && <p className="mb-2 text-xs text-green-600">Saved</p>}

          <div className="space-y-2">
            {cards.map((card) => (
              <div key={card.id}>
                {editingId === card.id ? (
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleCard(card.id)}
                    className="w-full truncate rounded-md border border-neutral-300 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {card.name || "Untitled"}
                  </button>
                )}
                {editingId === card.id &&
                  (curatorEditingIndex !== null ? renderCuratorForm() : renderExpandedFields())}
              </div>
            ))}

            {editingId === "new" && (
              <div>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                {curatorEditingIndex !== null ? renderCuratorForm() : renderExpandedFields()}
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-neutral-400">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </p>

          <button
            type="button"
            onClick={handleDeletePage}
            disabled={isDeleting}
            className="mt-4 block w-full rounded-md border border-red-200 px-3 py-1.5 text-center text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete Page
          </button>
        </div>
      )}

      {artistPickerOpen && (
        <ArtistSelectorModal
          selectedIds={draftCuratorArtists.map((a) => a.artistId)}
          onToggle={toggleCuratorArtist}
          onClose={() => setArtistPickerOpen(false)}
        />
      )}
    </div>
  );
}
