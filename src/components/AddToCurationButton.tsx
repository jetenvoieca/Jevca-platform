"use client";

import { useState, useTransition } from "react";
import {
  addWorksToCuration,
  curationsWithWork,
  listCurations,
  type CurationSummary,
} from "@/lib/actions/curations";
import { useBackdropClose } from "@/lib/useBackdropClose";

// Add to curation (2026-11-01, Craig's mockup) — in the Artwork Catalogue's
// Studio notes: lists the client's curations, those the work is already in
// greyed; choosing one adds the work to the end of it.
export default function AddToCurationButton({
  artistId,
  artworkId,
  artworkName,
  className = "",
}: {
  artistId: string;
  artworkId: string;
  artworkName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [curations, setCurations] = useState<CurationSummary[] | null>(null);
  const [inIds, setInIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => setOpen(false);
  const backdrop = useBackdropClose(close);

  const show = () => {
    setOpen(true);
    setError(null);
    setAddedTo(null);
    setCurations(null);
    startTransition(async () => {
      const [list, already] = await Promise.all([listCurations(artistId), curationsWithWork(artistId, artworkId)]);
      setCurations(list);
      setInIds(already);
    });
  };

  const add = (curation: CurationSummary) => {
    setError(null);
    startTransition(async () => {
      const result = await addWorksToCuration(curation.id, artistId, [artworkId]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInIds((prev) => [...prev, curation.id]);
      setAddedTo(curation.name);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={`rounded-md border border-neutral-400 px-3 text-sm text-neutral-700 hover:bg-neutral-50 ${className}`}
      >
        Add to curation
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" {...backdrop}>
          <div className="flex max-h-full w-full max-w-sm flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">Add to curation — {artworkName}</h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {addedTo && <p className="px-3 py-2 text-sm text-green-700">Added to {addedTo}.</p>}
              {curations === null ? (
                <p className="p-3 text-sm text-neutral-400">Loading…</p>
              ) : curations.length === 0 ? (
                <p className="p-3 text-sm text-neutral-400">No curations yet — add one on the Curations page.</p>
              ) : (
                curations.map((c) => {
                  const already = inIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => add(c)}
                      disabled={already || isPending}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:hover:bg-transparent"
                    >
                      <span className={already ? "text-neutral-400" : ""}>{c.name}</span>
                      {already && <span className="text-xs text-neutral-400">Already in</span>}
                    </button>
                  );
                })
              )}
              {error && <p className="p-3 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
