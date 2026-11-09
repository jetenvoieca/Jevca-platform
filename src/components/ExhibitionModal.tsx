"use client";

import { useEffect, useState } from "react";
import ImageSetEditor from "@/components/ImageSetEditor";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { createLocation } from "@/lib/actions/locations";
import type { LocationSummary } from "@/lib/artworkSettingsData";
import {
  deleteExhibition,
  setExhibitionArchived,
  setExhibitionImages,
  updateExhibition,
  type ExhibitionFields,
  type ExhibitionRow,
} from "@/lib/actions/exhibitions";

// An exhibition's window (2026-11-02, Craig's mockup; moved here
// 2026-11-09 to be shared by the Exhibitions catalogue and the Artist
// App's exhibitions page), laid out like a curation's Presentation: the
// pictures on the left (ImageSetEditor), on the right its Name, Venue
// (one of the artist's Locations — "+ New venue…" adds one as a Gallery;
// its address, phone, email and website are edited in Locations), Date &
// Time and Description, each saved when left. Archive keeps it but
// lists it apart in the catalogue (Restore brings it back); Delete
// removes it for good (2026-11-09: always offered).

const PANEL = "rounded-xl border border-neutral-300 px-3.5 py-2.5";
const PANEL_TITLE = "mb-1 text-center text-base text-neutral-900";
const FIELD = "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800";
const NEW_VENUE = "__new__";

export default function ExhibitionModal({
  exhibition: e,
  artistId,
  siteId,
  locations,
  onLocationAdded,
  onSaved,
  onDeleted,
  onClose,
  addPicturesFrom = "catalogue",
}: {
  exhibition: ExhibitionRow;
  artistId: string;
  siteId: string;
  locations: LocationSummary[];
  onLocationAdded: (location: LocationSummary) => void;
  onSaved: (row: ExhibitionRow) => void;
  onDeleted: () => void;
  onClose: () => void;
  // Where pictures are added from (ImageSetEditor's addFrom).
  addPicturesFrom?: "catalogue" | "file";
}) {
  const [name, setName] = useState(e.name);
  const [openingTimes, setOpeningTimes] = useState(e.openingTimes);
  const [description, setDescription] = useState(e.description);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Leaving the box being edited first, so its change is saved.
  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };
  const backdrop = useBackdropClose(close);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (fields: ExhibitionFields) => {
    setError(null);
    setSaving(true);
    const result = await updateExhibition(e.id, artistId, fields);
    setSaving(false);
    if ("error" in result) setError(result.error);
    else onSaved(result);
  };

  // Saved only when changed.
  const saveText = (field: "name" | "openingTimes" | "description", value: string) => {
    if (value.trim() !== e[field]) save({ [field]: value });
  };

  const chooseVenue = async (value: string) => {
    if (value !== NEW_VENUE) {
      save({ locationId: value || null });
      return;
    }
    const venueName = window.prompt("The new venue's name");
    if (!venueName?.trim()) return;
    setError(null);
    const created = await createLocation(artistId, siteId, venueName, "GALLERY");
    if ("error" in created) {
      setError(created.error);
      return;
    }
    if (!locations.some((l) => l.id === created.id)) onLocationAdded(created);
    save({ locationId: created.id });
  };

  const archive = async (archived: boolean) => {
    setError(null);
    const result = await setExhibitionArchived(e.id, artistId, archived);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved(result);
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Delete "${e.name || "this exhibition"}" for good? Its pictures stay in the Media Catalogue.`)) return;
    await deleteExhibition(e.id, artistId);
    onDeleted();
  };

  const venue = e.venue;
  const headerButton = "shrink-0 rounded-md border px-3 py-1 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" {...backdrop}>
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
            Exhibition — {name.trim() || "New exhibition"}
          </h2>
          <button
            type="button"
            onClick={remove}
            className={`${headerButton} border-red-200 text-red-600 hover:bg-red-50`}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => archive(!e.archived)}
            className={`${headerButton} border-neutral-300 hover:bg-neutral-50`}
          >
            {e.archived ? "Restore" : "Archive"}
          </button>
          <button type="button" onClick={close} className={`${headerButton} border-neutral-300 hover:bg-neutral-50`}>
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {error && <p className="mb-2.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="grid items-start gap-4 md:grid-cols-[4fr_5fr]">
            <ImageSetEditor
              artistId={artistId}
              siteId={siteId}
              images={e.images}
              addFrom={addPicturesFrom}
              save={(imageIds) => setExhibitionImages(e.id, artistId, imageIds)}
              onSaved={(images) => {
                setError(null);
                onSaved({ ...e, images });
              }}
              onError={setError}
            />

            <div className="flex flex-col gap-2.5">
              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Name</h3>
                <input
                  type="text"
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  onBlur={() => saveText("name", name)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") ev.currentTarget.blur();
                  }}
                  placeholder="e.g. Elephant Parade Show"
                  className={FIELD}
                />
              </div>

              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Venue</h3>
                <select value={venue?.locationId ?? ""} onChange={(ev) => chooseVenue(ev.target.value)} className={FIELD}>
                  <option value="">Choose a venue…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value={NEW_VENUE}>+ New venue…</option>
                </select>
                {venue && (
                  <div className="mt-2 flex flex-col gap-0.5 text-sm text-neutral-700">
                    {venue.address && <p className="whitespace-pre-line">{venue.address}</p>}
                    {venue.phone && <p>{venue.phone}</p>}
                    {(venue.email || venue.websiteUrl) && (
                      <p className="flex flex-wrap gap-x-4">
                        {venue.email && (
                          <a href={`mailto:${venue.email}`} className="underline">
                            {venue.email}
                          </a>
                        )}
                        {venue.websiteUrl && (
                          <a href={venue.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline">
                            {venue.websiteName || venue.websiteUrl}
                          </a>
                        )}
                      </p>
                    )}
                    {!venue.address && !venue.phone && !venue.email && !venue.websiteUrl && (
                      <p className="text-xs text-neutral-400">No contact details yet — add them in Locations.</p>
                    )}
                  </div>
                )}
              </div>

              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Date &amp; Time</h3>
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span>From</span>
                  <input
                    type="date"
                    value={e.startDate ?? ""}
                    onChange={(ev) => save({ startDate: ev.target.value })}
                    className={`${FIELD} min-w-0 flex-1`}
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={e.endDate ?? ""}
                    onChange={(ev) => save({ endDate: ev.target.value })}
                    className={`${FIELD} min-w-0 flex-1`}
                  />
                </div>
                <input
                  type="text"
                  value={openingTimes}
                  onChange={(ev) => setOpeningTimes(ev.target.value)}
                  onBlur={() => saveText("openingTimes", openingTimes)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") ev.currentTarget.blur();
                  }}
                  placeholder="e.g. Thursday to Saturday 10am to 6pm"
                  className={`${FIELD} mt-2`}
                />
              </div>

              <div className={PANEL}>
                <h3 className={PANEL_TITLE}>Description</h3>
                <textarea
                  value={description}
                  onChange={(ev) => setDescription(ev.target.value)}
                  onBlur={() => saveText("description", description)}
                  rows={6}
                  placeholder="About this exhibition"
                  className={`${FIELD} resize-y`}
                />
              </div>

              {saving && <p className="text-xs text-neutral-400">Saving…</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
