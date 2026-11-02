"use client";

import { useEffect, useState } from "react";
import AddIconButton from "@/components/AddIconButton";
import ImageSetEditor from "@/components/ImageSetEditor";
import ImageFill from "@/components/ImageFill";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { formatDate } from "@/lib/formatDate";
import { createLocation } from "@/lib/actions/locations";
import type { LocationSummary } from "@/lib/artworkSettingsData";
import {
  createExhibition,
  deleteExhibition,
  setExhibitionArchived,
  setExhibitionImages,
  updateExhibition,
  type ExhibitionFields,
  type ExhibitionRow,
} from "@/lib/actions/exhibitions";

// The Exhibitions catalogue (2026-11-02, Craig's mockup): the exhibitions
// as tiles — main picture, venue and dates — ⊞ to add one, and the
// archived ones apart (Archived). Clicking a tile opens its details in a
// window laid out like a curation's Presentation: the pictures on the
// left (ImageSetEditor), on the right its Name, Venue (one of the
// artist's Locations — "+ New venue…" adds one as a Gallery; its address,
// phone, email and website are edited in Locations), Date & Time and
// Description, each saved when left. Archive keeps it but lists it
// apart; an archived one can be restored or deleted.

const PANEL = "rounded-xl border border-neutral-300 px-3.5 py-2.5";
const PANEL_TITLE = "mb-1 text-center text-base text-neutral-900";
const FIELD = "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800";
const NEW_VENUE = "__new__";

// "01/02/2026 - 01/05/2026", either end alone, or nothing.
function datesLine(e: Pick<ExhibitionRow, "startDate" | "endDate">): string {
  return [e.startDate, e.endDate].filter((d): d is string => !!d).map(formatDate).join(" - ");
}

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
                <p className="text-sm text-neutral-500">{datesLine(e) || " "}</p>
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

function ExhibitionModal({
  exhibition: e,
  artistId,
  siteId,
  locations,
  onLocationAdded,
  onSaved,
  onDeleted,
  onClose,
}: {
  exhibition: ExhibitionRow;
  artistId: string;
  siteId: string;
  locations: LocationSummary[];
  onLocationAdded: (location: LocationSummary) => void;
  onSaved: (row: ExhibitionRow) => void;
  onDeleted: () => void;
  onClose: () => void;
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
          {e.archived ? (
            <>
              <button
                type="button"
                onClick={remove}
                className={`${headerButton} border-red-200 text-red-600 hover:bg-red-50`}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => archive(false)}
                className={`${headerButton} border-neutral-300 hover:bg-neutral-50`}
              >
                Restore
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => archive(true)}
              className={`${headerButton} border-neutral-300 hover:bg-neutral-50`}
            >
              Archive
            </button>
          )}
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
