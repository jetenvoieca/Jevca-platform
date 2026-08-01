"use client";

import { useState, useTransition } from "react";
import { getArtworksForArtist, quickCreateArtwork } from "@/lib/actions/media";

type PickedArtwork = {
  id: string;
  presentationTitle: string;
  imageUrl: string | null;
  presentationPrice: string | null;
  availability: string;
};

export default function ArtworkPicker({
  artistId,
  mode = "single",
  label = "Add Artwork",
  onSelect,
}: {
  artistId: string;
  mode?: "single" | "multi";
  label?: string;
  onSelect: (artworks: PickedArtwork[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [artworks, setArtworks] = useState<PickedArtwork[]>([]);
  const [selected, setSelected] = useState<PickedArtwork[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const load = (q: string) => {
    startTransition(async () => {
      const results = await getArtworksForArtist(artistId, q || undefined);
      setArtworks(
        results.map((a) => ({
          id: a.id,
          presentationTitle: a.presentationTitle,
          imageUrl: a.images[0]?.url ?? null,
          presentationPrice: a.presentationPrice != null ? a.presentationPrice.toString() : null,
          availability: a.availability,
        }))
      );
    });
  };

  const handleOpen = () => {
    setOpen(true);
    setSelected([]);
    load(query);
  };

  const handlePick = (a: PickedArtwork) => {
    if (mode === "single") {
      onSelect([a]);
      setOpen(false);
    } else {
      setSelected((prev) =>
        prev.some((p) => p.id === a.id) ? prev.filter((p) => p.id !== a.id) : [...prev, a]
      );
    }
  };

  const confirmMulti = () => {
    onSelect(selected);
    setSelected([]);
    setOpen(false);
  };

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateArtwork(artistId, newTitle);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.artwork) {
        const a: PickedArtwork = {
          id: result.artwork.id,
          presentationTitle: result.artwork.presentationTitle,
          imageUrl: null,
          presentationPrice: null,
          availability: "AVAILABLE",
        };
        setArtworks((prev) => [a, ...prev]);
        setNewTitle("");
        handlePick(a);
      }
    });
  };

  // Same trigger as MediaPicker — a blank dashed tile, not a button. See
  // decisions-log.md, 2026-07-31.
  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        + {label}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              load(e.target.value);
            }}
            placeholder="Search artworks…"
            autoFocus
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Or type a new artwork title…"
            className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newTitle.trim() || isPending}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {error && (
          <p className="border-b border-neutral-200 bg-red-50 px-4 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 gap-3">
            {artworks.map((a) => {
              const isSelected = selected.some((s) => s.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handlePick(a)}
                  className={`overflow-hidden rounded-md border-2 text-left ${
                    isSelected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                  }`}
                >
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400">
                      No image
                    </div>
                  )}
                  <p className="truncate px-1 py-1 text-xs text-neutral-700">
                    {a.presentationTitle}
                  </p>
                </button>
              );
            })}
          </div>
          {artworks.length === 0 && (
            <p className="py-12 text-center text-sm text-neutral-400">
              No artworks yet — type a title above to create one.
            </p>
          )}
        </div>

        {mode === "multi" && (
          <div className="flex items-center justify-between border-t border-neutral-200 p-4">
            <span className="text-sm text-neutral-500">{selected.length} selected</span>
            <button
              type="button"
              onClick={confirmMulti}
              disabled={selected.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
