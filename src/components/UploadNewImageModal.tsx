"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileDirect } from "@/lib/uploadDirect";

export type UploadedImage = Awaited<ReturnType<typeof uploadFileDirect>>;

// Shared "cut down Hopper" upload modal (2026-09-13, direct request —
// "same idea as delete and adding new main image"). The one place any
// picker in this app opens to let someone add a brand-new image without
// leaving for the full Hopper page. Used directly by MediaPicker's own
// "Upload new" (every "+ Add" tile across the app goes through
// MediaPicker, so this alone covers Related images, Marketing uploads,
// Content Block images, Section artwork grids, etc.), and wrapped by
// SetMainFromHopperModal for Delete & Replace's extra "then delete the
// old Main" step — one shared modal, not a separately-maintained copy
// per caller.
export default function UploadNewImageModal({
  artistId,
  siteId,
  title = "Get new Image",
  note,
  onClose,
  onUploaded,
}: {
  artistId: string;
  siteId: string;
  // Customisable per caller — MediaPicker uses the default; Delete &
  // Replace passes its own "Replace Main image" title instead.
  title?: string;
  // Optional line under the title — Delete & Replace uses this to spell
  // out that the old Main image is deleted once this upload succeeds.
  note?: string;
  onClose: () => void;
  // Called once the upload itself has succeeded, with the new image.
  // Whatever this does (select it, link it, delete something else
  // first) runs before the modal closes, and any error it throws is
  // shown here instead of the modal silently closing anyway.
  onUploaded: (image: UploadedImage) => Promise<void> | void;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const image = await uploadFileDirect(file, artistId, "SORTED", "Direct upload");
      await onUploaded(image);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      // z-[60], above MediaPicker's own modal (z-50) — this can open on
      // top of it (see MediaPicker.tsx's "Upload new"), so it needs to
      // sit above that overlay rather than behind it.
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-900">{title}</h2>
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

        {note && <p className="mb-3 text-xs text-neutral-500">{note}</p>}

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <label
          className={`flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-300 px-4 py-12 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 ${
            uploading ? "cursor-wait opacity-50" : "cursor-pointer"
          }`}
        >
          {uploading ? "Uploading…" : "+ Upload new Image"}
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
