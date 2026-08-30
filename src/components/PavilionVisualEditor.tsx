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
import type { PavilionCard, PavilionCurator } from "@/lib/blocks";

const MAX_CURATORS = 9;

// A parallel variant of PavilionEditor.tsx (2026-08-30) — same
// underlying data, same drag/resize canvas, same child-page actions.
// What's genuinely different here is the panel: closed by default, and
// deliberately never shows a list of every Pavilion to browse — the
// canvas itself IS that browsing surface. Two ways in:
//   - the pencil icon always opens a blank "Add Pavilion" form
//   - clicking a tile on the canvas opens the panel scoped to editing
//     just that one tile — but ONLY when the panel is already open;
//     clicking a tile while the canvas is shown full-screen (panel
//     closed) is a deliberate no-op for now.
//
// Curators (2026-08-30) drill one level deeper within this same panel:
// a Pavilion's form shows a compact list of its Curators (name only);
// clicking one, or "Add Curator", swaps the panel to that Curator's own
// Name/Image/Description/Save/Delete form — the identical template used
// for a Pavilion itself — with a "← Back" to return. A Curator's Save
// only updates the in-memory list; nothing is actually persisted until
// the Pavilion's own Save is clicked, same as every other field here.
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
  // itself is closed.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageId, setDraftImageId] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCurators, setDraftCurators] = useState<PavilionCurator[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Curator sub-editor state — "new" or an existing curator's index
  // while drilled into a Curator's own form; null while showing the
  // Pavilion-level form.
  const [curatorEditingIndex, setCuratorEditingIndex] = useState<number | "new" | null>(null);
  const [draftCuratorName, setDraftCuratorName] = useState("");
  const [draftCuratorDescription, setDraftCuratorDescription] = useState("");
  const [draftCuratorImageId, setDraftCuratorImageId] = useState("");
  const [draftCuratorImageUrl, setDraftCuratorImageUrl] = useState("");

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
    setDraftCurators([]);
    setCuratorEditingIndex(null);
  };

  // The pencil icon on the canvas — always opens a blank Add Pavilion
  // form. Editing an existing one happens by clicking its tile directly
  // (handleCardClick below), not through this button, so pencil has
  // exactly one job.
  const handlePencilClick = () => {
    if (panelOpen && editingId === "new") {
      setPanelOpen(false);
      setEditingId(null);
      return;
    }
    openNewCardForm();
  };

  // Clicking a tile on the canvas — only does anything while the panel
  // is already open; at that point it opens the panel scoped to just
  // this one card's fields.
  const handleCardClick = (id: string) => {
    if (!panelOpen) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    setEditingId(id);
    setDraftName(card.name);
    setDraftDescription(card.description);
    setDraftImageId(card.imageId);
    setDraftImageUrl(card.imageUrl);
    setDraftCurators(card.curators ?? []);
    setCuratorEditingIndex(null);
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

  // ---- Curator sub-editor (drills into the same panel) ----

  const openNewCuratorForm = () => {
    if (draftCurators.length >= MAX_CURATORS) return;
    setCuratorEditingIndex("new");
    setDraftCuratorName("");
    setDraftCuratorDescription("");
    setDraftCuratorImageId("");
    setDraftCuratorImageUrl("");
  };

  const openExistingCurator = (index: number) => {
    const c = draftCurators[index];
    if (!c) return;
    setCuratorEditingIndex(index);
    setDraftCuratorName(c.name);
    setDraftCuratorDescription(c.description);
    setDraftCuratorImageId(c.imageId);
    setDraftCuratorImageUrl(c.imageUrl);
  };

  const handleSaveCurator = () => {
    const trimmedName = draftCuratorName.trim();
    if (!trimmedName) return;
    if (curatorEditingIndex === "new") {
      setDraftCurators((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: trimmedName,
          description: draftCuratorDescription.trim(),
          imageId: draftCuratorImageId,
          imageUrl: draftCuratorImageUrl,
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
        <PavilionCanvas cards={cards} onCardClick={handleCardClick} onCardChange={handleCardChange} />
      </div>

      {panelOpen && (
        <div className="relative h-full overflow-y-auto border-l border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => {
              setPanelOpen(false);
              setEditingId(null);
              setCuratorEditingIndex(null);
            }}
            title="Close"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:bg-neutral-50"
          >
            ✕
          </button>

          {curatorEditingIndex !== null ? (
            // ---- Curator-level form — identical template to the
            // Pavilion-level one below, just scoped to one Curator. ----
            <div className="pr-6">
              <button
                type="button"
                onClick={() => setCuratorEditingIndex(null)}
                className="mb-3 text-sm text-neutral-500 hover:underline"
              >
                ← Back to {draftName || "Pavilion"}
              </button>

              <div className="space-y-3">
                <input
                  type="text"
                  value={draftCuratorName}
                  onChange={(e) => setDraftCuratorName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />

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
            </div>
          ) : (
            // ---- Pavilion-level form ----
            <>
              <div className="mb-3 pr-6">
                <input
                  type="text"
                  defaultValue={pageTitle}
                  onBlur={(e) => handleRenamePage(e.target.value)}
                  className="w-full rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
                />
                {titleSaved && <p className="mt-1 text-xs text-green-600">Saved</p>}
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />

                {/* Curators — a compact list of names, each opening its
                    own full Name/Image/Description form on click, same
                    template as this Pavilion's own form. */}
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
                    Add Curator
                    {draftCurators.length > 0 ? ` (${draftCurators.length}/${MAX_CURATORS})` : ""}
                  </button>
                </div>

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
            </>
          )}
        </div>
      )}
    </div>
  );
}
