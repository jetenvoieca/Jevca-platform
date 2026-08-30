"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveDraftBlocks, deletePage, menuItemCountForPage, updatePageTitle } from "@/lib/actions/pages";
import {
  createPavilionChildPage,
  renamePavilionChildPage,
  deletePavilionChildPage,
} from "@/lib/actions/pavilions";
import { nextCardPosition } from "@/lib/pavilionLayout";
import PavilionCanvas from "@/components/PavilionCanvas";
import MediaPicker from "@/components/MediaPicker";
import type { PavilionCard } from "@/lib/blocks";

// Its own two-column layout (2026-08-30), not the generic ThreeColumnShell
// used by PageEditor/SectionEditor — deliberately tight, since the panel
// needs to stay compact as more content (Curators, etc.) lands in it, and
// the canvas needs to be able to go full-width via the expand toggle.
//
// Root is h-full so the canvas can genuinely fill the available page
// height rather than only its own content's height — the site's own
// layout.tsx already gives this component's slot a bounded, scrollable
// height (its "independently scrolling columns" convention), this just
// opts into it. Left (canvas) and right (list) columns each scroll
// independently within that height.
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
  const [isSaving, setIsSaving] = useState(false);
  // Collapses the right panel entirely and gives the canvas the full
  // width — toggled from the small corner button on the canvas itself,
  // not a separate "Open full preview" page/tab.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
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

  // Live position/size updates from the canvas — pushed straight into
  // `cards`, which the debounced effect above then persists.
  const handleCardChange = (
    id: string,
    patch: Partial<Pick<PavilionCard, "x" | "y" | "width" | "height">>
  ) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const openNewCardForm = () => {
    setEditingId("new");
    setDraftName("");
    setDraftDescription("");
    setDraftImageId("");
    setDraftImageUrl("");
  };

  const toggleCard = (id: string) => {
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

  const renderExpandedFields = () => (
    <div className="mt-2 space-y-3 pl-1">
      {/* Curator functionality itself is a later step — this is a
          placeholder link only, per that decision, so it doesn't
          silently disappear from the layout once it's actually built. */}
      <button type="button" className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Add Curator
      </button>

      {/* Large, uncropped-to-a-tiny-box clickable preview (2026-08-30) —
          the image itself is the trigger to change it now, via
          MediaPicker's previewUrl prop, rather than a small thumbnail
          plus a separate tiny "Change" button. */}
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
          onClick={() => setPanelCollapsed((v) => !v)}
          title={panelCollapsed ? "Show panel" : "Expand canvas"}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50"
        >
          {panelCollapsed ? "⤡" : "⤢"}
        </button>
        <PavilionCanvas cards={cards} onCardClick={toggleCard} onCardChange={handleCardChange} />
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
                {editingId === card.id && renderExpandedFields()}
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
                {renderExpandedFields()}
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
    </div>
  );
}
