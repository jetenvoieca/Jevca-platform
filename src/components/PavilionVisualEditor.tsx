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

// A parallel variant of PavilionEditor.tsx (2026-08-30) — same
// underlying data, same drag/resize canvas, same child-page actions.
// What's genuinely different here is the panel: closed by default, and
// deliberately never shows a list of every Pavilion to browse — the
// canvas itself IS that browsing surface. Two ways in:
//   - the pencil icon always opens a blank "Add Pavilion" form
//   - clicking a tile on the canvas opens the panel scoped to editing
//     just that one tile, nothing else
// PavilionEditor's own panel, by contrast, stays open with a full list —
// this one is deliberately narrower in scope.
export default function PavilionVisualEditor({
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
  const [panelOpen, setPanelOpen] = useState(false);
  // "new" while the blank Add-Pavilion form is open; a card's own id
  // while that one tile's fields are open; null only when the panel
  // itself is closed (there's never a "panel open, nothing selected"
  // state in this variant — see openNewCardForm/toggleCard below).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageId, setDraftImageId] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Autosaves the whole cards array — covers both drag/resize on the
  // canvas and any card content change, same debounced pattern used
  // everywhere else in this app.
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
    setPanelOpen(true);
    setEditingId("new");
    setDraftName("");
    setDraftDescription("");
    setDraftImageId("");
    setDraftImageUrl("");
  };

  // The pencil icon on the canvas — always opens a blank Add Pavilion
  // form. Editing an existing one happens by clicking its tile directly
  // (toggleCard below), not through this button, so pencil has exactly
  // one job.
  const handlePencilClick = () => {
    if (panelOpen && editingId === "new") {
      setPanelOpen(false);
      setEditingId(null);
      return;
    }
    openNewCardForm();
  };

  // Clicking a tile on the canvas — opens the panel scoped to just this
  // one card's fields. Clicking the same tile again closes the panel;
  // clicking a different tile switches straight to it.
  const toggleCard = (id: string) => {
    if (panelOpen && editingId === id) {
      setPanelOpen(false);
      setEditingId(null);
      return;
    }
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    setPanelOpen(true);
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
    setPanelOpen(false);
    setEditingId(null);
  };

  const handleDeleteCard = async () => {
    if (!editingId || editingId === "new") {
      setPanelOpen(false);
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
    setPanelOpen(false);
    setEditingId(null);
  };

  return (
    <div className={`h-full ${panelOpen ? "grid grid-cols-[1fr_300px] gap-0" : "grid grid-cols-1"}`}>
      <div className="relative h-full overflow-y-auto p-6">
        <button
          type="button"
          onClick={handlePencilClick}
          title="Add Pavilion"
          className="absolute right-9 top-9 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700"
        >
          ✎
        </button>
        <PavilionCanvas cards={cards} onCardClick={toggleCard} onCardChange={handleCardChange} />
      </div>

      {panelOpen && (
        <div className="relative h-full overflow-y-auto border-l border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => {
              setPanelOpen(false);
              setEditingId(null);
            }}
            title="Close"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:bg-neutral-50"
          >
            ✕
          </button>

          <div className="mb-3 pr-6">
            <input
              type="text"
              defaultValue={pageTitle}
              onBlur={(e) => handleRenamePage(e.target.value)}
              className="w-full rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
            />
            {titleSaved && <p className="mt-1 text-xs text-green-600">Saved</p>}
          </div>

          {/* Just this one tile's fields — no list of other Pavilions
              here (2026-08-30, direct request): the canvas is the
              browsing surface, this panel is only ever "add one" or
              "edit the one you just clicked". */}
          <div className="space-y-3">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name"
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />

            {/* Curator functionality itself is a later step — this is a
                placeholder link only, so it doesn't silently disappear
                from the layout once it's actually built. */}
            <button
              type="button"
              className="text-xs font-medium uppercase tracking-wide text-neutral-400"
            >
              Add Curator
            </button>

            {/* Large, uncropped-to-a-tiny-box clickable preview — the
                image itself is the trigger to change it, via
                MediaPicker's previewUrl prop. */}
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
