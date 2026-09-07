"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveDraftBlocks, deletePage, menuItemCountForPage, updatePageTitle } from "@/lib/actions/pages";
import { getArtworkDetailForClient, getArtworksByIds } from "@/lib/actions/artworks";
import ThreeColumnShell from "@/components/ThreeColumnShell";
import ArtworkPicker from "@/components/ArtworkPicker";
import ArtworkDetailPanel, {
  type ArtworkDetail,
  type ArtworkSettings,
} from "@/components/ArtworkDetailPanel";
import type { PortfolioGridArtwork } from "@/components/PortfolioGrid";

type EditorGroup = {
  id: string;
  name: string;
  artworks: PortfolioGridArtwork[];
};

// Turns a raw getArtworksByIds row into the shape both this editor's own
// grid tiles and the read-only details panel need — one mapping, used
// everywhere an artwork enters this editor's state (initial load, adding
// via ArtworkPicker, refreshing after a full-edit save).
function toTile(a: {
  id: string;
  presentationTitle: string;
  images: { url: string }[];
  presentationPrice: string | null;
  description: string | null;
  presentationMedium: string | null;
  viewingLocation: string | null;
  size: string | null;
  edition: string | null;
}): PortfolioGridArtwork {
  return {
    id: a.id,
    presentationTitle: a.presentationTitle,
    imageUrl: a.images[0]?.url ?? null,
    presentationPrice: a.presentationPrice,
    description: a.description,
    presentationMedium: a.presentationMedium,
    viewingLocation: a.viewingLocation,
    size: a.size,
    edition: a.edition,
  };
}

export default function PortfolioEditor({
  siteId,
  artistId,
  artistName,
  pageId,
  pageTitle,
  initialGroups,
  settings,
  siteDefaultCurrency = "GBP",
}: {
  siteId: string;
  artistId: string;
  // Shown above the page title, matching the reference sites' own
  // heading (e.g. "Jilly Sutton RSS") and the mockup's "Artist name"
  // line — display only, edited from the site's Owner card, not here.
  artistName: string;
  pageId: string;
  pageTitle: string;
  initialGroups: EditorGroup[];
  settings: ArtworkSettings;
  siteDefaultCurrency?: string;
}) {
  const [groups, setGroups] = useState<EditorGroup[]>(initialGroups);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialGroups[0]?.id ?? null);
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  // Persistent selection — which artwork's details are shown alongside
  // the grid. Defaults to the active category's first artwork, matching
  // the reference sites (landing on a category shows its first piece,
  // not an empty panel).
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(
    activeGroup?.artworks[0]?.id ?? null
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Full edit mode — the heavy Catalogue/Presentation/Payment panel,
  // opened explicitly via "Edit artwork details" rather than shown by
  // default. The default view is the plain read-only preview (matching
  // what the reference sites' visitors actually see), reusing the tile
  // data already in state rather than a fresh fetch.
  const [isEditingArtwork, setIsEditingArtwork] = useState(false);
  const [editingArtwork, setEditingArtwork] = useState<ArtworkDetail | null>(null);
  const [loadingArtwork, setLoadingArtwork] = useState(false);
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveDraftBlocks(pageId, {
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          artworkIds: g.artworks.map((a) => a.id),
        })),
      });
      setSaveState("saved");
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const selectedArtwork = activeGroup?.artworks.find((a) => a.id === selectedArtworkId) ?? null;

  const selectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    const g = groups.find((x) => x.id === groupId);
    setSelectedArtworkId(g?.artworks[0]?.id ?? null);
    setIsEditingArtwork(false);
  };

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

  const addGroup = () => {
    const name = prompt("Category name? (e.g. \"Head Sculptures\")")?.trim();
    if (!name) return;
    const newGroup: EditorGroup = { id: crypto.randomUUID(), name, artworks: [] };
    setGroups((prev) => [...prev, newGroup]);
    selectGroup(newGroup.id);
  };

  const renameGroup = (groupId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
  };

  const deleteGroup = (groupId: string) => {
    if (
      !confirm(
        "Delete this category? Its artworks aren't deleted — just removed from this page."
      )
    ) {
      return;
    }
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== groupId);
      if (activeGroupId === groupId) {
        const nextGroup = next[0];
        setActiveGroupId(nextGroup?.id ?? null);
        setSelectedArtworkId(nextGroup?.artworks[0]?.id ?? null);
      }
      return next;
    });
  };

  const addArtworksToActiveGroup = (
    picked: { id: string; presentationTitle: string; imageUrl: string | null; presentationPrice: string | null }[]
  ) => {
    if (!activeGroupId) return;
    const groupId = activeGroupId;
    getArtworksByIds(picked.map((p) => p.id)).then((rows) => {
      const tiles = rows.map(toTile);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, artworks: [...g.artworks, ...tiles.filter((t) => !g.artworks.some((e) => e.id === t.id))] }
            : g
        )
      );
      // Selecting the first newly-added artwork if nothing was selected
      // yet (e.g. the category was empty) — otherwise leave the current
      // selection alone.
      if (!selectedArtworkId && tiles[0]) setSelectedArtworkId(tiles[0].id);
    });
  };

  const removeArtwork = (artworkId: string) => {
    if (!activeGroupId) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === activeGroupId
          ? { ...g, artworks: g.artworks.filter((a) => a.id !== artworkId) }
          : g
      )
    );
    if (selectedArtworkId === artworkId) {
      const remaining = activeGroup?.artworks.filter((a) => a.id !== artworkId) ?? [];
      setSelectedArtworkId(remaining[0]?.id ?? null);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex || !activeGroupId) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== activeGroupId) return g;
        const next = [...g.artworks];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(targetIndex, 0, moved);
        return { ...g, artworks: next };
      })
    );
    setDragIndex(null);
  };

  const openFullEdit = () => {
    if (!selectedArtworkId) return;
    setLoadingArtwork(true);
    setIsEditingArtwork(true);
    getArtworkDetailForClient(selectedArtworkId).then((detail) => {
      setEditingArtwork(detail);
      setLoadingArtwork(false);
    });
  };

  const closeFullEdit = async () => {
    if (selectedArtworkId && activeGroupId) {
      const [fresh] = await getArtworksByIds([selectedArtworkId]);
      const groupId = activeGroupId;
      const artworkId = selectedArtworkId;
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          if (!fresh) {
            // Deleted from within the panel — drop it from this group's grid too.
            return { ...g, artworks: g.artworks.filter((a) => a.id !== artworkId) };
          }
          const freshTile = toTile(fresh);
          return { ...g, artworks: g.artworks.map((a) => (a.id === artworkId ? freshTile : a)) };
        })
      );
      if (!fresh) setSelectedArtworkId(null);
    }
    setIsEditingArtwork(false);
    setEditingArtwork(null);
  };

  return (
    <div>
      {/* Header — artist name + editable page title, matching the
          mockup's "Artist name / Page name" and the reference sites'
          own serif heading. Sizes now match jillysuttonsculpture.com's
          own heading proportions (2026-09-07, feedback round 6) —
          artist name bumped to text-xl, page title input to text-2xl,
          same values as the public PortfolioGrid header. */}
      <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-4">
        <p className="font-serif text-xl font-bold text-neutral-800">{artistName}</p>
        <input
          type="text"
          defaultValue={pageTitle}
          onBlur={(e) => handleRenamePage(e.target.value)}
          className="w-full max-w-md rounded-md border border-transparent px-1 py-0.5 -mx-1 font-serif text-2xl font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
        />
        {titleSaved && <p className="mt-1 text-xs text-green-600">Saved</p>}
      </div>

      <ThreeColumnShell
        preview={
          !activeGroup ? (
            <p className="text-sm text-neutral-400">
              Add a category on the right to start adding artworks.
            </p>
          ) : (
            <div>
              {groups.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 border-b border-neutral-200 pb-2 text-sm">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => selectGroup(g.id)}
                      className={
                        activeGroupId === g.id
                          ? "font-semibold text-neutral-900 underline"
                          : "text-neutral-500 hover:text-neutral-800"
                      }
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}

              {activeGroup.artworks.length === 0 && (
                <p className="mb-3 text-sm text-neutral-400">
                  Use the tile below to add artworks, then drag to reorder.
                </p>
              )}

              <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,110px))] gap-2">
                {activeGroup.artworks.map((a, i) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => setDragIndex(null)}
                    onClick={() => {
                      setSelectedArtworkId(a.id);
                      setIsEditingArtwork(false);
                    }}
                    className={`group relative aspect-square cursor-pointer overflow-hidden rounded-md border-2 ${
                      dragIndex === i
                        ? "border-neutral-900 opacity-50"
                        : selectedArtworkId === a.id
                          ? "border-neutral-900"
                          : "border-transparent"
                    }`}
                  >
                    {/* aspect-square lives on this wrapper div, not the
                        <img> itself — Safari can size an aspect-ratio'd
                        <img> inconsistently before/if it fails to load,
                        which showed up as an empty tall box (bug fixed
                        2026-09-07, feedback round 4). */}
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                        No image
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeArtwork(a.id);
                      }}
                      className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <ArtworkPicker
                  artistId={artistId}
                  mode="multi"
                  label="Add"
                  onSelect={addArtworksToActiveGroup}
                />
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Click a tile to see its details. Drag to reorder.
              </p>
            </div>
          )
        }
        edit={
          isEditingArtwork ? (
            <div>
              <button
                type="button"
                onClick={closeFullEdit}
                className="mb-3 text-sm text-neutral-500 hover:underline"
              >
                ← Back to details
              </button>
              {loadingArtwork || !editingArtwork ? (
                <p className="text-sm text-neutral-400">Loading…</p>
              ) : (
                <ArtworkDetailPanel
                  siteId={siteId}
                  artistId={artistId}
                  artwork={editingArtwork}
                  settings={settings}
                  siteDefaultCurrency={siteDefaultCurrency}
                  onClose={closeFullEdit}
                />
              )}
            </div>
          ) : selectedArtwork ? (
            <div>
              {selectedArtwork.imageUrl && (
                <img
                  src={selectedArtwork.imageUrl}
                  alt=""
                  className="mb-3 max-h-96 w-full rounded-md bg-neutral-50 object-contain"
                />
              )}
              <h2 className="font-serif text-lg font-semibold text-neutral-900">
                {selectedArtwork.presentationTitle}
              </h2>
              {selectedArtwork.description && (
                <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">
                  {selectedArtwork.description}
                </p>
              )}
              <div className="mt-3 space-y-0.5 text-xs text-neutral-500">
                {selectedArtwork.presentationMedium && <p>{selectedArtwork.presentationMedium}</p>}
                {selectedArtwork.size && <p>{selectedArtwork.size}</p>}
                {selectedArtwork.edition && <p>Edition of {selectedArtwork.edition}</p>}
                {selectedArtwork.viewingLocation && (
                  <p>Can be seen at {selectedArtwork.viewingLocation}</p>
                )}
              </div>
              {selectedArtwork.presentationPrice && (
                <p className="mt-2 text-sm font-medium text-neutral-900">
                  £{selectedArtwork.presentationPrice}
                </p>
              )}
              <button
                type="button"
                onClick={openFullEdit}
                className="mt-4 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Edit artwork details
              </button>
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              Add or select an artwork on the left to see its details here.
            </p>
          )
        }
        menu={
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Categories
                </p>
                <button
                  type="button"
                  onClick={addGroup}
                  className="text-xs font-medium text-neutral-600 hover:underline"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {groups.length === 0 && (
                  <p className="text-xs text-neutral-400">No categories yet.</p>
                )}
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
                      activeGroupId === g.id ? "bg-neutral-200" : "hover:bg-neutral-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectGroup(g.id)}
                      className="flex-1 truncate text-left text-sm text-neutral-800"
                    >
                      {g.name}
                      <span className="ml-1 text-xs text-neutral-400">
                        ({g.artworks.length})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const value = prompt("Rename category", g.name);
                        if (value) renameGroup(g.id, value);
                      }}
                      className="hidden text-xs text-neutral-400 hover:text-neutral-700 group-hover:block"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      className="hidden text-xs text-neutral-400 hover:text-red-600 group-hover:block"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-neutral-400">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
              </p>
              <Link
                href={`/sites/${siteId}/pages/${pageId}/preview`}
                target="_blank"
                className="mt-2 block rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm hover:bg-neutral-50"
              >
                Open full preview
              </Link>

              <button
                type="button"
                onClick={handleDeletePage}
                disabled={isDeleting}
                className="mt-4 block w-full rounded-md border border-red-200 px-3 py-1.5 text-center text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete Page
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}
