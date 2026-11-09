"use client";

import { useEffect } from "react";
import CurationWorkPresentation from "@/components/CurationWorkPresentation";

// A work's Presentation within a curation, in a centred window (2026-10-04;
// shared 2026-11-08 by the Curations page and the Artist App). Closing
// leaves the field being edited first, so its change is saved (every
// presentation field saves when it loses focus). Escape closes it.
export default function CurationWorkPresentationModal({
  curationId,
  artworkId,
  workName,
  artistId,
  siteId,
  onClose,
  onArtworkChanged,
  showMedium = true,
  addPicturesFrom = "catalogue",
  mainRemovable = false,
  basic = false,
}: {
  curationId: string;
  artworkId: string;
  workName: string;
  artistId: string;
  siteId: string;
  onClose: () => void;
  // See CurationWorkPresentation.
  onArtworkChanged: () => void;
  showMedium?: boolean;
  addPicturesFrom?: "catalogue" | "file";
  mainRemovable?: boolean;
  basic?: boolean;
}) {
  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        {/* Frozen: which work this is, and Close. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">Presentation — {workName}</h2>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          <CurationWorkPresentation
            key={`${curationId}:${artworkId}`}
            curationId={curationId}
            artworkId={artworkId}
            artistId={artistId}
            siteId={siteId}
            onArtworkChanged={onArtworkChanged}
            showMedium={showMedium}
            addPicturesFrom={addPicturesFrom}
            mainRemovable={mainRemovable}
            basic={basic}
          />
        </div>
      </div>
    </div>
  );
}
