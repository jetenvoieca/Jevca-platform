"use client";

import { useState } from "react";
import { getArtworkDetailForClient } from "@/lib/actions/artworks";
import ArtworkDetailPanel, { type ArtworkDetail, type ArtworkSettings } from "@/components/ArtworkDetailPanel";
import { useBackdropClose } from "@/lib/useBackdropClose";

// A work's Artwork Catalogue details in a window over another page
// (2026-10-29: one copy for the Locations and Curations pages' Catalogue
// buttons). It keeps itself up to date after every change and passes the
// fresh details on (`onChanged`), so the page behind can refresh too.
// Create Derivative closes it.
export default function ArtworkCatalogueModal({
  siteId,
  artistId,
  artwork,
  settings,
  onClose,
  onChanged,
  onDeleted,
}: {
  siteId: string;
  artistId: string;
  artwork: ArtworkDetail;
  settings: ArtworkSettings;
  onClose: () => void;
  onChanged?: (artwork: ArtworkDetail) => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState(artwork);
  const backdrop = useBackdropClose(onClose);

  const refresh = async () => {
    const fresh = await getArtworkDetailForClient(detail.id);
    if (!fresh) return;
    setDetail(fresh);
    onChanged?.(fresh);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl">
        <ArtworkDetailPanel
          key={detail.id}
          siteId={siteId}
          artistId={artistId}
          artwork={detail}
          settings={settings}
          onClose={onClose}
          onDeleted={onDeleted}
          onDuplicated={onClose}
          onDataChanged={refresh}
          showCloseButton={true}
        />
      </div>
    </div>
  );
}
