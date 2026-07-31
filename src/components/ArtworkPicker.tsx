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
  onSelect,
}: {
  artistId: string;
  onSelect: (artwork: PickedArtwork) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [artworks, setArtworks] = useState<PickedArtwork[]>([]);
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
    load(query);
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
        onSelect({
          id: result.artwork.id,
          presentationTitle: result.artwork.presentationTitle,
          imageUrl: null,
          presentationPrice: null,
          availability: "AVAILABLE",
        });
        setNewTitle("");
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        Choose Artwork
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            load(e.target.value);
          }}
          placeholder="Search artworks…"
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-500 hover:underline"
        >
          Close
        </button>
      </div>

      <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
        {artworks.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              onSelect(a);
              setOpen(false);
            }}
            className="rounded-md border border-transparent p-1 text-left hover:border-neutral-300"
          >
            {a.imageUrl ? (
              <img src={a.imageUrl} alt="" className="h-16 w-full rounded object-cover" />
            ) : (
              <div className="flex h-16 w-full items-center justify-center rounded bg-neutral-200 text-xs text-neutral-400">
                No image
              </div>
            )}
            <p className="mt-1 truncate text-xs text-neutral-700">{a.presentationTitle}</p>
          </button>
        ))}
        {artworks.length === 0 && (
          <p className="col-span-3 py-4 text-center text-xs text-neutral-400">No artworks yet.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-neutral-200 pt-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Or type a new artwork title…"
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newTitle.trim() || isPending}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Create
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-neutral-400">
        This creates a bare-bones Artwork record (title only) — fill in the rest from the
        Artworks Catalogue.
      </p>
    </div>
  );
}
