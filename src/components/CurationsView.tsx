"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ArtworkPicker from "@/components/ArtworkPicker";
import AddIconButton from "@/components/AddIconButton";
import CurationWorkPresentation from "@/components/CurationWorkPresentation";
import SoldFlag from "@/components/SoldFlag";
import { isSold } from "@/lib/artworkFilters";
import CurationSectionsEditor from "@/components/CurationSectionsEditor";
import {
  addWorksToCuration,
  createCuration,
  curationsWithWork,
  deleteCuration,
  getCuration,
  removeWorkFromCuration,
  renameCuration,
  reorderCuration,
  type CurationDetail,
  type CurationSummary,
} from "@/lib/actions/curations";
import { useClientWords } from "@/components/ClientWordsProvider";
import type { ArtworkDetail, ArtworkSettings } from "@/components/ArtworkDetailPanel";
import ArtworkCatalogueModal from "@/components/ArtworkCatalogueModal";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import { moveArtworksToLocation } from "@/lib/actions/locations";
import { useBackdropClose } from "@/lib/useBackdropClose";

// Whole amounts show without pence ("£400"), as in the mockup.
function formatPrice(amount: string | null, currency: string): string | null {
  if (amount == null) return null;
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return null;
  const digits = Number.isInteger(n) ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(digits)}`;
  }
}

// Curations page (2026-09-24, stage one). Two columns:
// - left: the open curation — its name (click to rename), ⊞ to add works,
//   About, Delete, and its works in order (drag to reorder, hover × to
//   remove).
// - right: every curation; click one to open it, or ⊞ to add a new one.
//
// About (2026-10-16, Craig's mockup): the curation's optional content —
// its Title (the curation's name) and the presentation sections
// (Description, Video, Supporting Media; see CurationSectionsEditor) —
// opens in a centred modal from the About button.
//
// Presentation (2026-10-03) — a work's images, Name, Description and
// Purchase Options within this curation (see CurationWorkPresentation).
// Curating and presenting are separate steps, so it opens in a centred
// modal (2026-10-04, direct request) from the "Presentation" button that
// appears when hovering over a work, rather than sitting beside the
// works.
//
// Curations (2026-10-29, Craig's mockup) — a hover button above Catalogue
// opening a window to move the work to another curation or add it to
// another as well (current curation shaded, ones it's already in greyed).
//
// Catalogue and Consign (2026-10-27, Craig's mockup) — two more hover
// buttons above Presentation: Catalogue opens the work's Artwork
// Catalogue details (ArtworkDetailPanel) in a modal; Consign (unsold
// works only) lists the locations, and choosing one puts the work there
// (moveArtworksToLocation, as Locations' Add works does).
//
// Frozen headers (2026-10-04, general requirement): the page fills the
// space under the site header and never scrolls as a whole. The open
// curation's title row and the list's "Curation Name" heading stay put;
// the works and the list of curations each scroll on their own.
export default function CurationsView({
  artistId,
  siteId,
  curations: initialCurations,
  initialSelected,
  settings,
}: {
  artistId: string;
  siteId: string;
  curations: CurationSummary[];
  initialSelected: CurationDetail | null;
  settings: ArtworkSettings;
}) {
  const words = useClientWords();
  const [curations, setCurations] = useState<CurationSummary[]>(initialCurations);
  const [selected, setSelected] = useState<CurationDetail | null>(initialSelected);
  const [titleDraft, setTitleDraft] = useState(initialSelected?.name ?? "");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // The work whose presentation modal is open, if any.
  const [presentingId, setPresentingId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  // The work open in the Catalogue modal, or in the Consign modal.
  const [catalogueWork, setCatalogueWork] = useState<ArtworkDetail | null>(null);
  const [consignWork, setConsignWork] = useState<ArtworkDetail | null>(null);
  const [consignError, setConsignError] = useState<string | null>(null);
  // The work whose Curations window is open (2026-10-29, Craig's mockup):
  // move it to another curation, or add it to another as well.
  const [curationsWork, setCurationsWork] = useState<{
    artworkId: string;
    name: string;
    inIds: string[];
    mode: "move" | "add";
  } | null>(null);
  const [curationsError, setCurationsError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Which curation is meant to be open right now, readable inside
  // in-flight async work — stops a slow response for a curation you've
  // since moved away from overwriting the one now open.
  const selectedIdRef = useRef<string | null>(initialSelected?.id ?? null);

  const updateUrlSelected = (id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("selected", id);
    else params.delete("selected");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const show = (detail: CurationDetail | null) => {
    selectedIdRef.current = detail?.id ?? null;
    setSelected(detail);
    setTitleDraft(detail?.name ?? "");
    setAboutOpen(false);
    updateUrlSelected(detail?.id ?? null);
  };

  // Re-reads the open curation from the server — used to recover if a
  // remove or reorder fails, so the screen never shows an order that
  // wasn't actually saved.
  const reload = async (id: string) => {
    const detail = await getCuration(id, artistId);
    if (selectedIdRef.current === id) show(detail);
  };

  const openCuration = (id: string) => {
    if (selectedIdRef.current === id) return;
    setError(null);
    selectedIdRef.current = id;
    setLoadingId(id);
    (async () => {
      const detail = await getCuration(id, artistId);
      if (selectedIdRef.current === id) show(detail);
      setLoadingId(null);
    })();
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createCuration(artistId, name);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCurations((prev) => [...prev, result]);
      setNewName("");
      setAdding(false);
      show({ id: result.id, name: result.name, description: null, works: [] });
    });
  };

  const handleRename = () => {
    if (!selected) return;
    const name = titleDraft.trim();
    if (!name || name === selected.name) {
      setTitleDraft(selected.name);
      return;
    }
    setError(null);
    const id = selected.id;
    startTransition(async () => {
      const result = await renameCuration(id, artistId, name);
      if ("error" in result) {
        setError(result.error);
        if (selectedIdRef.current === id) setTitleDraft(selected.name);
        return;
      }
      setCurations((prev) => prev.map((c) => (c.id === id ? result : c)));
      if (selectedIdRef.current === id) {
        setSelected((prev) => (prev ? { ...prev, name: result.name } : prev));
        setTitleDraft(result.name);
      }
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    if (
      !confirm(`Delete the curation "${selected.name}"? The ${words.items.toLowerCase()} themselves are not affected.`)
    ) {
      return;
    }
    setError(null);
    const id = selected.id;
    startTransition(async () => {
      await deleteCuration(id, artistId);
      setCurations((prev) => prev.filter((c) => c.id !== id));
      if (selectedIdRef.current === id) show(null);
    });
  };

  const handleAddWorks = (picked: { id: string }[]) => {
    if (!selected || picked.length === 0) return;
    setError(null);
    const id = selected.id;
    startTransition(async () => {
      const result = await addWorksToCuration(
        id,
        artistId,
        picked.map((p) => p.id)
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (selectedIdRef.current === id) setSelected(result);
    });
  };

  const handleRemoveWork = (artworkId: string) => {
    if (!selected) return;
    setError(null);
    const id = selected.id;
    setSelected((prev) =>
      prev ? { ...prev, works: prev.works.filter((w) => w.artworkId !== artworkId) } : prev
    );
    (async () => {
      const result = await removeWorkFromCuration(id, artistId, artworkId);
      if ("error" in result) {
        setError(result.error);
        await reload(id);
      }
    })();
  };

  const handleDrop = (targetIndex: number) => {
    if (!selected || dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const works = [...selected.works];
    const [moved] = works.splice(dragIndex, 1);
    works.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setError(null);

    const id = selected.id;
    setSelected({ ...selected, works });
    (async () => {
      const result = await reorderCuration(
        id,
        artistId,
        works.map((w) => w.artworkId)
      );
      if ("error" in result) {
        setError(result.error);
        await reload(id);
      }
    })();
  };

  const activeId = loadingId ?? selected?.id ?? null;
  // Closes by itself if the work leaves the curation, or another
  // curation is opened.
  const presentingWork = selected?.works.find((w) => w.artworkId === presentingId) ?? null;

  // Leaving the field being edited first, so its change is saved (every
  // presentation field saves when it loses focus).
  const closePresentation = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setPresentingId(null);
  };

  // Same for About: the field being edited saves as it loses focus.
  const closeAbout = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setAboutOpen(false);
  };

  // Catalogue: the work's Artwork Catalogue details. Any change there
  // (name, price, sold…) refreshes the curation's tiles.
  const openCatalogue = async (artworkId: string) => {
    const detail = await getArtworkDetailForClient(artworkId);
    if (detail) setCatalogueWork(detail);
  };
  const closeCatalogue = () => setCatalogueWork(null);

  // Curations: which curations the work is in, then Move to (out of this
  // one, into the one chosen) or Add to (into the one chosen as well).
  const openCurationsFor = async (artworkId: string, name: string) => {
    setCurationsError(null);
    const inIds = await curationsWithWork(artistId, artworkId);
    setCurationsWork({ artworkId, name, inIds, mode: "move" });
  };
  const closeCurations = () => setCurationsWork(null);
  const curationsBackdrop = useBackdropClose(closeCurations);
  const putInCuration = (targetId: string) => {
    if (!curationsWork || !selected) return;
    const { artworkId, mode } = curationsWork;
    const fromId = selected.id;
    setCurationsError(null);
    startTransition(async () => {
      const added = await addWorksToCuration(targetId, artistId, [artworkId]);
      if ("error" in added) {
        setCurationsError(added.error);
        return;
      }
      if (mode === "move") {
        const removed = await removeWorkFromCuration(fromId, artistId, artworkId);
        if ("error" in removed) {
          setCurationsError(removed.error);
          return;
        }
        await reload(fromId);
      }
      closeCurations();
    });
  };

  // Consign: choose the location to put the work at.
  const openConsign = async (artworkId: string) => {
    setConsignError(null);
    const detail = await getArtworkDetailForClient(artworkId);
    if (detail) setConsignWork(detail);
  };
  const closeConsign = () => setConsignWork(null);
  const consignBackdrop = useBackdropClose(closeConsign);
  const consignTo = (locationName: string) => {
    if (!consignWork) return;
    setConsignError(null);
    startTransition(async () => {
      const result = await moveArtworksToLocation(artistId, locationName, [consignWork.id]);
      if ("error" in result) {
        setConsignError(result.error);
        return;
      }
      if (result.moved === 0) {
        setConsignError("It couldn't be consigned — it's sold or in a sale.");
        return;
      }
      closeConsign();
    });
  };

  const modalOpen = !!presentingWork || (aboutOpen && !!selected);
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closePresentation();
      closeAbout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // The curation's name, typed in place: saves when the box is left,
  // Escape puts the saved name back. Used at the top and in About.
  const nameInputProps = selected
    ? {
        type: "text",
        value: titleDraft,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTitleDraft(e.target.value),
        onBlur: handleRename,
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitleDraft(selected.name);
            e.currentTarget.blur();
          }
        },
      }
    : null;

  return (
    <div className="grid h-full grid-cols-[4fr_1fr] overflow-hidden">
      {/* Left: the open curation */}
      <section className="flex min-h-0 flex-col border-r border-neutral-200">
        {error && (
          <p className="mx-6 mt-6 shrink-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {loadingId && !selected ? (
          <p className="p-6 text-sm text-neutral-400">Loading…</p>
        ) : !selected ? (
          <p className="p-6 text-sm text-neutral-400">
            {curations.length === 0
              ? "No curations yet — add one from the list on the right."
              : "Choose a curation from the list on the right."}
          </p>
        ) : (
          <div className={`flex min-h-0 flex-1 flex-col ${loadingId ? "opacity-60" : ""}`}>
            {/* Frozen: the curation's name, About and Delete. */}
            <div className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-6">
              {/* As wide as the name, so ⊞ sits right after it,
                  vertically centred on it (2026-10-29, Craig's mockup). */}
              <input
                {...nameInputProps}
                size={Math.max(titleDraft.length, 4)}
                title="Click to rename"
                className="-mx-1 min-w-0 max-w-full rounded-md border border-transparent px-1 py-0.5 text-3xl font-light text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 focus:outline-none"
              />
              {/* ⊞ adds works to this curation (the standard add icon,
                  2026-10-28). */}
              <div className="flex shrink-0 items-center">
                <ArtworkPicker
                  artistId={artistId}
                  mode="multi"
                  label={`Add ${words.items.toLowerCase()}`}
                  allowCreate={false}
                  excludeIds={selected.works.map((w) => w.artworkId)}
                  onSelect={handleAddWorks}
                />
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-900 hover:bg-neutral-50"
              >
                About
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="shrink-0 rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            {/* The works, scrolling on their own. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-6">
                {selected.works.map((w, i) => {
                  const price = formatPrice(w.offeredPrice, w.priceCurrency);
                  return (
                    <div
                      key={w.artworkId}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", w.artworkId);
                        setDragIndex(i);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(i);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={`group relative cursor-grab ${dragIndex === i ? "opacity-40" : ""}`}
                    >
                      <div className="relative">
                        {w.imageUrl ? (
                          <img
                            src={w.imageUrl}
                            alt=""
                            draggable={false}
                            className="aspect-square w-full rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                            No image
                          </div>
                        )}
                        <div className="absolute bottom-2 left-1/2 hidden -translate-x-1/2 flex-col items-stretch gap-1 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => openCurationsFor(w.artworkId, w.catalogueName)}
                            className="rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-900 shadow hover:bg-white"
                          >
                            Curations
                          </button>
                          <button
                            type="button"
                            onClick={() => openCatalogue(w.artworkId)}
                            className="rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-900 shadow hover:bg-white"
                          >
                            Catalogue
                          </button>
                          {!isSold(w.availability) && (
                            <button
                              type="button"
                              onClick={() => openConsign(w.artworkId)}
                              className="rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-900 shadow hover:bg-white"
                            >
                              Consign
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPresentingId(w.artworkId)}
                            className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-900 shadow hover:bg-white"
                          >
                            Presentation
                          </button>
                        </div>
                        {isSold(w.availability) && <SoldFlag />}
                      </div>
                      <p className="mt-2 flex gap-1.5 text-sm font-medium text-neutral-900">
                        <span className="truncate">{w.catalogueName}</span>
                        <span className="shrink-0 font-normal text-neutral-400">#{w.catalogueNumber}</span>
                      </p>
                      {price && <p className="text-sm text-neutral-400">{price}</p>}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWork(w.artworkId);
                        }}
                        title="Remove from this curation"
                        className="absolute left-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              {selected.works.length === 0 && (
                <p className="text-sm text-neutral-400">No {words.items.toLowerCase()} yet — add them with ⊞.</p>
              )}

              {selected.works.length > 1 && (
                <p className="mt-4 text-xs text-neutral-400">Drag to reorder.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {selected && presentingWork && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePresentation();
          }}
        >
          <div className="flex max-h-full w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            {/* Frozen: which work this is, and Close. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
                Presentation — {presentingWork.catalogueName}
              </h2>
              <button
                type="button"
                onClick={closePresentation}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CurationWorkPresentation
                key={`${selected.id}:${presentingWork.artworkId}`}
                curationId={selected.id}
                artworkId={presentingWork.artworkId}
                artistId={artistId}
                siteId={siteId}
                onArtworkChanged={() => reload(selected.id)}
              />
            </div>
          </div>
        </div>
      )}

      {selected && aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAbout();
          }}
        >
          <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
            {/* Frozen: which curation this is, and Close. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
                About — {selected.name}
              </h2>
              <button
                type="button"
                onClick={closeAbout}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="rounded-xl border border-neutral-300 p-3">
                <h3 className="mb-2 text-center text-base text-neutral-900">Title</h3>
                <input
                  {...nameInputProps}
                  className="w-full rounded-md border border-transparent p-1 text-sm text-neutral-800 hover:border-neutral-300 focus:border-neutral-400 focus:outline-none"
                />
              </div>
              <CurationSectionsEditor
                key={selected.id}
                curationId={selected.id}
                artistId={artistId}
                siteId={siteId}
              />
            </div>
          </div>
        </div>
      )}

      {/* Right: every curation */}
      <aside className="flex min-h-0 flex-col p-6">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-neutral-300 p-4">
          {/* Frozen heading; the list beneath it scrolls. */}
          <div className="mb-4 flex shrink-0 items-center justify-center gap-2">
            <h2 className="text-lg text-neutral-900">Curation Name</h2>
            <AddIconButton label="Add a curation" onClick={() => setAdding(true)} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1">
              {curations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCuration(c.id)}
                  className={`truncate rounded-md px-2 py-1.5 text-left text-lg ${
                    activeId === c.id
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {adding ? (
              <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setAdding(false);
                      setNewName("");
                    }
                  }}
                  autoFocus
                  placeholder="Curation name"
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newName.trim() || isPending}
                    className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                    }}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      {catalogueWork && (
        <ArtworkCatalogueModal
          siteId={siteId}
          artistId={artistId}
          artwork={catalogueWork}
          settings={settings}
          onClose={closeCatalogue}
          onChanged={() => {
            if (selected) reload(selected.id);
          }}
          onDeleted={() => {
            closeCatalogue();
            if (selected) reload(selected.id);
          }}
        />
      )}

      {curationsWork && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...curationsBackdrop}>
          <div className="flex max-h-full w-full max-w-sm flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">Curations — {curationsWork.name}</h2>
              <button
                type="button"
                onClick={closeCurations}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pt-4">
              {(["move", "add"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCurationsWork({ ...curationsWork, mode: m })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    curationsWork.mode === m
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {m === "move" ? "Move to" : "Add to"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {curations.map((c) => {
                const here = c.id === selected.id;
                const already = curationsWork.inIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => putInCuration(c.id)}
                    disabled={already || isPending}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:hover:bg-transparent ${
                      here ? "bg-neutral-100 disabled:hover:bg-neutral-100" : ""
                    }`}
                  >
                    <span className={already && !here ? "text-neutral-400" : ""}>{c.name}</span>
                    {here ? (
                      <span className="text-xs text-neutral-500">This one</span>
                    ) : already ? (
                      <span className="text-xs text-neutral-400">Already in</span>
                    ) : null}
                  </button>
                );
              })}
              {curationsError && <p className="p-3 text-sm text-red-600">{curationsError}</p>}
            </div>
          </div>
        </div>
      )}

      {consignWork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...consignBackdrop}>
          <div className="flex max-h-full w-full max-w-sm flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
                Consign — {consignWork.catalogueName}
              </h2>
              <button
                type="button"
                onClick={closeConsign}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {settings.locations.length === 0 ? (
                <p className="p-3 text-sm text-neutral-400">No locations yet — add them on the Locations page.</p>
              ) : (
                settings.locations.map((l) => {
                  const here = consignWork.location === l.name;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => consignTo(l.name)}
                      disabled={here || isPending}
                      className="flex w-full items-center justify-between border-b border-neutral-100 px-3 py-2.5 text-left text-sm text-neutral-800 last:border-b-0 hover:bg-neutral-50 disabled:hover:bg-transparent"
                    >
                      <span>{l.name}</span>
                      {here && <span className="text-xs text-neutral-500">Here now</span>}
                    </button>
                  );
                })
              )}
              {consignError && <p className="p-3 text-sm text-red-600">{consignError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
