"use client";

import { useEffect, useState } from "react";
import { getAllArtistsForPicker } from "@/lib/actions/artistPicker";

type ArtistRow = { id: string; name: string; siteName: string | null };

// The full-platform Artist checklist shown when adding Artists to a
// Curator (2026-08-30) — ticking adds one, unticking removes it, with
// no separate "confirm" step, matching how MediaPicker's own single-
// select mode is instant rather than needing a confirm button. Every tick
// is reported immediately via onToggle; this component holds no
// selection state of its own beyond the fetched list.
export default function ArtistSelectorModal({
  selectedIds,
  onToggle,
  onClose,
}: {
  selectedIds: string[];
  onToggle: (artist: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllArtistsForPicker().then((rows) => {
      setArtists(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : artists.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-400">No artists found.</p>
          ) : (
            artists.map((a) => {
              const checked = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggle({ id: a.id, name: a.name })}
                  className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm ${
                      checked ? "border-neutral-900 text-neutral-900" : "border-neutral-300"
                    }`}
                  >
                    {checked ? "×" : ""}
                  </span>
                  <span className="text-sm font-medium text-neutral-900">
                    {a.name}
                    {a.siteName && (
                      <span className="ml-1 font-normal text-neutral-400">— {a.siteName}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-neutral-200 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
