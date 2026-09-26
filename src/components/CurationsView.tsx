"use client";

import { useRef, useState, useTransition } from "react";
import ArtworkPicker from "@/components/ArtworkPicker";
import {
  addWorksToCuration,
  createCuration,
  deleteCuration,
  getCuration,
  removeWorkFromCuration,
  renameCuration,
  reorderCuration,
  type CurationDetail,
  type CurationSummary,
} from "@/lib/actions/curations";

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
// - left: the open curation — its name (click to rename), Delete, and
//   its works in order (drag to reorder, hover × to remove, "+ Add
//   Works" tile to pick more).
// - right: every curation; click one to open it, or add a new one.
//
// A centre column ("Display this curation using ……") originally sat
// between these for a planned stage-two display-mode chooser — removed
// 2026-09-26, direct request, after rethinking that part of the
// workflow. Nothing else about stage one changes; if a display-mode
// step is designed later it doesn't have to look like that placeholder
// did.
export default function CurationsView({
  artistId,
  currency,
  curations: initialCurations,
  initialSelected,
}: {
  artistId: string;
  currency: string;
  curations: CurationSummary[];
  initialSelected: CurationDetail | null;
}) {
  const [curations, setCurations] = useState<CurationSummary[]>(initialCurations);
  const [selected, setSelected] = useState<CurationDetail | null>(initialSelected);
  const [titleDraft, setTitleDraft] = useState(initialSelected?.name ?? "");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
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
      show({ id: result.id, name: result.name, works: [] });
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
      !confirm(
        `Delete the curation "${selected.name}"? The artworks themselves are not affected.`
      )
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

  return (
    <div className="grid min-h-full grid-cols-[4fr_1fr]">
      {/* Left: the open curation */}
      <section className="border-r border-neutral-200 p-6">
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {loadingId && !selected ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : !selected ? (
          <p className="text-sm text-neutral-400">
            {curations.length === 0
              ? "No curations yet — add one from the list on the right."
              : "Choose a curation from the list on the right."}
          </p>
        ) : (
          <div className={loadingId ? "opacity-60" : ""}>
            <div className="mb-6 flex items-start gap-3">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setTitleDraft(selected.name);
                    e.currentTarget.blur();
                  }
                }}
                title="Click to rename"
                className="-mx-1 min-w-0 flex-1 rounded-md border border-transparent px-1 py-0.5 text-3xl font-light text-neutral-900 hover:border-neutral-300 focus:border-neutral-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="mt-1.5 shrink-0 rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-6">
              {selected.works.map((w, i) => {
                const price = formatPrice(w.offeredPrice, currency);
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
                    <p className="mt-2 truncate text-sm font-medium text-neutral-900">
                      {w.catalogueName}
                    </p>
                    {price && <p className="text-sm text-neutral-400">{price}</p>}
                    <button
                      type="button"
                      onClick={() => handleRemoveWork(w.artworkId)}
                      title="Remove from this curation"
                      className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <ArtworkPicker
                artistId={artistId}
                mode="multi"
                label="Add Works"
                allowCreate={false}
                excludeIds={selected.works.map((w) => w.artworkId)}
                onSelect={handleAddWorks}
              />
            </div>

            {selected.works.length > 1 && (
              <p className="mt-4 text-xs text-neutral-400">Drag to reorder.</p>
            )}
          </div>
        )}
      </section>

      {/* Right: every curation */}
      <aside className="py-6 pr-6">
        <div className="flex h-full min-h-[70vh] flex-col rounded-xl border border-neutral-300 p-4">
          <h2 className="mb-4 text-center text-lg text-neutral-900">Curation Name</h2>

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
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-3 rounded-md px-2 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-50"
            >
              + Add New Curation
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
