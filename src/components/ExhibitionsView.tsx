"use client";

import { useState } from "react";
import AddIconButton from "@/components/AddIconButton";
import ExhibitionModal from "@/components/ExhibitionModal";
import ImageFill from "@/components/ImageFill";
import { exhibitionDates } from "@/lib/exhibitionDates";
import type { LocationSummary } from "@/lib/artworkSettingsData";
import { createExhibition, type ExhibitionRow } from "@/lib/actions/exhibitions";

// The Exhibitions catalogue (2026-11-02, Craig's mockup): the exhibitions
// as tiles — main picture, venue and dates — ⊞ to add one, and the
// archived ones apart (Archived). Clicking a tile opens its window
// (ExhibitionModal).

export default function ExhibitionsView({
  artistId,
  siteId,
  initialExhibitions,
  initialLocations,
}: {
  artistId: string;
  siteId: string;
  initialExhibitions: ExhibitionRow[];
  initialLocations: LocationSummary[];
}) {
  const [exhibitions, setExhibitions] = useState(initialExhibitions);
  const [locations, setLocations] = useState(initialLocations);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const shown = exhibitions.filter((e) => e.archived === showArchived);
  const archivedCount = exhibitions.filter((e) => e.archived).length;
  const open = exhibitions.find((e) => e.id === openId) ?? null;
  const replace = (row: ExhibitionRow) => setExhibitions((prev) => prev.map((e) => (e.id === row.id ? row : e)));

  const add = async () => {
    setAdding(true);
    const row = await createExhibition(artistId);
    setAdding(false);
    setExhibitions((prev) => [...prev, row]);
    setShowArchived(false);
    setOpenId(row.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-4">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">
            {showArchived ? "Archived exhibitions" : "Exhibitions"}
          </h1>
          {!showArchived && <AddIconButton label="Add an exhibition" onClick={add} disabled={adding} />}
          <span className="flex-1" />
          {(archivedCount > 0 || showArchived) && (
            <button
              type="button"
              onClick={() => setShowArchived((a) => !a)}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {showArchived ? "← Exhibitions" : `Archived (${archivedCount})`}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {showArchived ? "No archived exhibitions." : "No exhibitions yet — click ⊞ to add one."}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
            {shown.map((e) => (
              <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className="block w-full text-left">
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-100">
                  {e.images[0] ? (
                    <ImageFill image={e.images[0]} />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-neutral-400">No picture</span>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-neutral-900">
                  {e.venue?.name || e.name || "New exhibition"}
                </p>
                <p className="text-sm text-neutral-500">{exhibitionDates(e.startDate, e.endDate) || " "}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <ExhibitionModal
          key={open.id}
          exhibition={open}
          artistId={artistId}
          siteId={siteId}
          locations={locations}
          onLocationAdded={(l) => setLocations((prev) => [...prev, l].sort((a, b) => a.name.localeCompare(b.name)))}
          onSaved={replace}
          onDeleted={() => {
            setExhibitions((prev) => prev.filter((e) => e.id !== open.id));
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
