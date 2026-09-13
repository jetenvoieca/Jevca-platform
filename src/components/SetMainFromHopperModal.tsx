"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getNextHopperItem, addHopperItemToArtwork } from "@/lib/actions/hopper";
import HopperItemPreview, { type HopperPreviewItem } from "@/components/HopperItemPreview";

// "Delete & Replace"'s own limited window onto the Hopper (2026-09-13,
// direct request — "take the middle part of hopper and show it with
// just the option of making a new main image in a modal over the
// detail panel"). Reuses the exact same preview component
// (HopperItemPreview) and the exact same linking action
// (addHopperItemToArtwork) the full Hopper page itself uses — not a
// second, separately-maintained version of either. Deliberately narrow:
// shows only the single newest item awaiting sorting, with just one
// action (make it this artwork's Main image); everything else (Bin,
// Add to Media, Create new artwork, sorting through the rest of the
// queue, etc.) stays exclusive to the full Hopper page, reached here via
// "Open Hopper".
export default function SetMainFromHopperModal({
  artworkId,
  siteId,
  artistId,
  onClose,
  onDone,
}: {
  artworkId: string;
  siteId: string;
  artistId: string;
  onClose: () => void;
  // Called once the image is actually set as Main — the caller (
  // ArtworkImageManager) uses this to trigger its own refetch, the same
  // way every other change in that component does.
  onDone: () => void;
}) {
  const router = useRouter();
  // undefined = still loading, null = Hopper is empty, otherwise the
  // single newest item.
  const [item, setItem] = useState<HopperPreviewItem | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNextHopperItem(artistId).then(setItem);
  }, [artistId]);

  const handleMakeMain = () => {
    if (!item) return;
    setSaving(true);
    addHopperItemToArtwork(item.id, siteId, artworkId, true).then(() => {
      setSaving(false);
      onDone();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-900">Set new Main image</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {item === undefined ? (
          <p className="py-12 text-center text-sm text-neutral-400">Loading…</p>
        ) : item === null ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            Hopper is empty — upload a new image there first.
          </p>
        ) : (
          <HopperItemPreview item={item} />
        )}

        <div className="mt-4 flex items-center gap-3 border-t border-neutral-200 pt-4">
          <button
            type="button"
            onClick={handleMakeMain}
            disabled={!item || saving}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Make Main image"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/sites/${siteId}/hopper`)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Open Hopper
          </button>
        </div>
      </div>
    </div>
  );
}
