"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileDirect } from "@/lib/uploadDirect";
import { linkImagesToArtwork } from "@/lib/actions/artworks";

// "Delete & Replace"'s own limited window onto adding a new image
// (2026-09-13, direct request — "let them upload a brand-new file right
// there, no trip to the full Hopper page"). Reuses the exact same
// upload primitive (uploadFileDirect) and the exact same linking action
// (linkImagesToArtwork) every other upload/add flow in this app already
// uses — not a second, separately-maintained version of either.
// Deliberately narrow: one file in, becomes this artwork's new Main
// image, done — no queue, no sorting, no other destinations. Uploads
// straight in as SORTED (bypassing the Hopper queue entirely), the same
// way MediaPicker/MediaCatalogueView's own direct uploads already do —
// this is a single, purposeful replacement of one specific artwork's
// record image, not raw incoming material that needs sorting later.
// "Open Hopper" stays as the way out to the full page for anything more
// involved (picking an existing image, adding several, etc.).
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
  // Called once the new image is actually set as Main — the caller
  // (ArtworkImageManager) uses this to trigger its own refetch, the
  // same way every other change in that component does.
  onDone: () => void;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const image = await uploadFileDirect(file, artistId, "SORTED", "Artwork main image replacement");
      await linkImagesToArtwork(artworkId, [image.id], siteId);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
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

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <label
          className={`flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 px-4 py-12 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 ${
            uploading ? "cursor-wait opacity-50" : "cursor-pointer"
          }`}
        >
          {uploading ? "Uploading…" : "+ Upload new Main image"}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
        </label>

        <div className="mt-4 flex items-center gap-3 border-t border-neutral-200 pt-4">
          <button
            type="button"
            onClick={() => router.push(`/sites/${siteId}/hopper`)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Open Hopper
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
