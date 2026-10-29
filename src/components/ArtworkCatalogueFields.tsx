"use client";

import { useState } from "react";
import type { ArtworkSettings } from "@/components/ArtworkDetailPanel";
import { addArtworkType, addSettingOption } from "@/lib/actions/artworkSettings";
import { createLocation, type LocationSummary } from "@/lib/actions/locations";
import { useClientWords } from "@/components/ClientWordsProvider";

// Keeps a select from silently dropping an existing value that isn't (yet)
// in the preset list — e.g. legacy data typed in before Settings existed,
// or a value just added inline via the "+ Add new…" option below, before
// a fresh settings list has come back from the server.
function withCurrent(presets: string[], current: string | null) {
  if (!current || presets.includes(current)) return presets;
  return [current, ...presets];
}

export type ArtworkFacetValues = {
  type: string;
  medium: string;
  size: string;
  edition: string;
  // Kept as a string here (not number | null) since this is always read
  // straight off a form field — callers convert to/from a number at
  // their own DB boundary. No longer editable from this form (2026-09-11,
  // direct request — see the note by the hidden input further down) but
  // still threaded through so an existing value is never silently wiped.
  availableQty: string;
  location: string;
  // Free text (e.g. "June 2025") — see the matching note on
  // Artwork.date in schema.prisma.
  date: string;
  studioNotes: string;
};

// Vertical padding cut ~20% (2026-09-11, direct request — "catalogue
// will be a high usage area") — py-2 (8px) down to 6.4px via an
// arbitrary value, since no standard Tailwind step lands on exactly
// 20% less. Horizontal padding untouched; only height was asked for.
const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-[6.4px] text-sm";
// Every single-line box (text input, dropdown, button beside one) is
// exactly this tall (2026-10-29): an input and a select with the same
// padding render at different heights, which put Name and Location out
// of line. Shared with the Catalogue window's own Name and price boxes.
export const FIELD_HEIGHT = "h-9";
const lineCls = `w-full rounded-md border border-neutral-300 px-3 text-sm ${FIELD_HEIGHT}`;
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

// Sentinel option value for "+ Add new…" (2026-09-11) — never a real
// preset name, so it can never collide with one. Selecting it never
// actually gets submitted: the onChange handlers below intercept it,
// prompt for a name, and swap the select's value over to the real new
// entry before anything autosaves.
const ADD_NEW = "__add_new__";

// The Type / Medium / Size / Edition / Location / Date / Studio notes
// block — one shared component (2026-09-07, direct request)
// used by both the full Artwork editor's Catalogue tab
// (ArtworkDetailPanel) and the Hopper's quick-add form
// (HopperView/QuickCatalogueFields). These two had drifted into
// separately-maintained copies — the Hopper version was missing Edition
// entirely, and showed Availability unconditionally — which is exactly
// the kind of drift that causes costly mistakes. Unifying them here means
// a future field change only has to happen once.
//
// Group removed (2026-09-24) — replaced by Curations.
//
// Available (qty) removed from the visible form entirely (2026-09-11,
// direct request) — any existing value is preserved via a hidden input
// (see below) rather than deleted, so nothing already on record is lost;
// it's just no longer something this form edits.
//
// Name and Reference/Offered price stay outside this component — the
// caller renders Name as the first grid cell, so Name and Type share a
// row. `children`, if given, renders after Date so the Catalogue tab can
// slot its price fields into the middle of the grid.
//
// No Availability here (2026-10-14, Craig's mockup): an artwork with no
// sale is available as a matter of course, and one is only ever made
// SOLD by recording its sale at its Location.
//
// Expects to be rendered directly inside a caller's own
// `<div className="grid grid-cols-2 gap-4">` (a bare fragment, not a
// wrapping element of its own), same grid every field in both forms has
// always shared.
export default function ArtworkCatalogueFields({
  settings,
  values,
  onAutosave,
  onTypeOrSizeChange,
  onLocationChange,
  onViewLocation,
  children,
  name,
  picture,
  artistId,
  siteId,
  onLocationAdded,
}: {
  settings: Pick<ArtworkSettings, "artworkTypes" | "mediumPresets" | "sizePresets" | "locations">;
  values: ArtworkFacetValues;
  // Fired (with the enclosing form) after a field changes, for callers
  // that want to autosave immediately — the Catalogue tab's
  // autosaveCatalogue. Omit for a plain uncontrolled form only read on
  // submit — the Hopper's quick-add, where the artwork doesn't exist
  // yet to save to.
  onAutosave?: (form: HTMLFormElement) => void;
  // Fired on Type or Size change specifically, so a caller with its own
  // live Reference price preview can recompute it.
  onTypeOrSizeChange?: (type: string, size: string) => void;
  // Fired on Location change, so the Catalogue tab can label its price
  // "Consigned price" while the Location is a Gallery.
  onLocationChange?: (location: string) => void;
  // A View button beside Location, shown when given: opens the work in
  // its Location.
  onViewLocation?: () => void;
  // The price (Catalogue / Hopper's own), shown after Size / Edition.
  children?: React.ReactNode;
  // The Name field, first in the column (2026-10-28).
  name: React.ReactNode;
  // The work's picture, to the left of the fields (the Catalogue's) —
  // omitted, the fields take the full width (the Hopper's).
  picture?: React.ReactNode;
  // Inline "+ Add new…" on Type, Medium, Size and Location (2026-09-11,
  // direct request — "all drop-downs add ability to add to lists";
  // 2026-10-27: Size too, and in every form using these fields, the
  // Hopper's included). The new value is saved to the client's own
  // Settings list here (Type has its own table with a Ref value; a
  // Location asks Gallery or Own first — see actions/locations.ts).
  artistId: string;
  siteId: string;
  // Told about a Location just added, for a caller keeping its own list.
  onLocationAdded?: (location: LocationSummary) => void;
}) {
  const [typeValue, setTypeValue] = useState(values.type);
  const [sizeValue, setSizeValue] = useState(values.size);
  // Medium/Location are controlled state too (2026-09-11) — needed so a
  // value just added inline (not yet in `settings`, since that only
  // refreshes from the server afterwards) can still be shown as
  // selected via withCurrent, the same way Type/Size already handle a
  // value outside the preset list.
  const [mediumValue, setMediumValue] = useState(values.medium);
  const [locationValue, setLocationValue] = useState(values.location);
  // Original/Unique pieces don't have editions the way prints do — both
  // forms show a simpler set of fields for them. Tracked live (not just
  // at load) so switching Type immediately shows/hides Edition.
  // Substring rather than exact match, since Type is free text from the
  // artist's own preset list and can be phrased several ways ("Edition",
  // "Giclée Edition", "Limited Edition").
  const isEditionType = typeValue.trim().toLowerCase().includes("edition");

  const words = useClientWords();
  const onAddType = async (name: string) => {
    const fd = new FormData();
    fd.set("name", name);
    await addArtworkType(artistId, siteId, fd);
  };
  const addToList = (field: "mediumPresets" | "sizePresets") => async (name: string) => {
    const fd = new FormData();
    fd.set("value", name);
    await addSettingOption(artistId, siteId, field, fd);
  };
  const onAddMedium = addToList("mediumPresets");
  const onAddSize = addToList("sizePresets");
  const onAddLocation = async (name: string) => {
    const isGallery = window.confirm(
      `Is "${name}" a ${words.location} you consign to?\n\nOK = ${words.location}\nCancel = Own (e.g. your studio)`
    );
    const result = await createLocation(artistId, siteId, name, isGallery ? "GALLERY" : "OWN");
    if ("error" in result) alert(result.error);
    else onLocationAdded?.(result);
  };

  // Shared "+ Add new…" flow for a select (2026-09-11). Deliberately a
  // plain window.prompt() rather than a custom inline input/popover —
  // this is a quick, occasional escape hatch for a missing preset, not
  // a primary interaction, and a prompt needs no extra layout space in
  // an already-dense form. Persists the new value via `persist` (the
  // matching onAdd* callback), then updates local state so it's
  // selected immediately (via withCurrent, since `settings` itself
  // won't include it until a fresh load) and autosaves it onto the
  // artwork. The autosave is deferred a tick — `persist` and the state
  // update both need to actually land (state update flushed into the
  // DOM's controlled select value) before FormData(form) inside
  // onAutosave would see the right value; calling it synchronously in
  // the same tick as setState risks reading the select's old value.
  const addNew = (
    label: string,
    persist: (name: string) => Promise<void>,
    setValue: (v: string) => void,
    form: HTMLFormElement,
    onAdded?: (value: string) => void
  ) => {
    const entered = window.prompt(`Add a new ${label}:`)?.trim();
    if (!entered) return;
    persist(entered);
    setValue(entered);
    onAdded?.(entered);
    setTimeout(() => onAutosave?.(form), 0);
  };

  return (
    <>
      {/* Craig's mockups (2026-10-28/29): Type, Edition, Size, the price
          (children) and Location; Medium below; then Date and the notes
          in the private Studio notes box. */}
      {/* With a picture (2026-10-29, Craig's mockup): picture and Name
          under it on the left, the other fields on the right, both
          columns the same height so the picture's top meets Type's and
          Name's bottom meets Location's. Without one (the Hopper), Name
          heads the single column. */}
      <div className={picture ? "grid grid-cols-2 items-stretch gap-4" : ""}>
        {picture && (
          <div className="flex flex-col justify-between gap-3">
            {picture}
            {name}
          </div>
        )}
        {/* Spread to the full height beside the picture, so the first
            and last fields line up with its top and Name's bottom. */}
        <div className={picture ? "flex flex-col justify-between gap-3" : "space-y-3"}>
          {!picture && name}
          <div>
            <label className={labelCls}>Type</label>
            <select
              name="type"
              value={typeValue}
              onChange={(e) => {
                const v = e.target.value;
                const form = e.currentTarget.form!;
                if (v === ADD_NEW) {
                  addNew("Type", onAddType, setTypeValue, form, (newType) =>
                    onTypeOrSizeChange?.(newType, sizeValue)
                  );
                  return;
                }
                setTypeValue(v);
                onTypeOrSizeChange?.(v, sizeValue);
                onAutosave?.(form);
              }}
              className={lineCls}
            >
              <option value="">Choose from list…</option>
              {withCurrent(settings.artworkTypes, typeValue).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={ADD_NEW}>+ Add new…</option>
            </select>
          </div>
          {/* Edition only applies to editioned work — Originals and Uniques
              are one-offs (2026-08-15 decision). Always shown, below Type,
              and greyed out unless the Type includes "Edition" (2026-10-29,
              Craig's mockup); any value on record is kept either way. */}
          <div>
            <label className={`${labelCls} ${isEditionType ? "" : "text-neutral-400"}`}>Edition</label>
            {isEditionType ? (
              <input
                type="text"
                name="edition"
                defaultValue={values.edition}
                onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
                className={lineCls}
              />
            ) : (
              <>
                <input type="text" disabled value={values.edition} aria-label="Edition" className={`${lineCls} bg-neutral-50 text-neutral-400`} />
                <input type="hidden" name="edition" value={values.edition} />
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Size</label>
            <select
              name="size"
              value={sizeValue}
              onChange={(e) => {
                const v = e.target.value;
                const form = e.currentTarget.form!;
                if (v === ADD_NEW) {
                  addNew("Size", onAddSize, setSizeValue, form, (newSize) => onTypeOrSizeChange?.(typeValue, newSize));
                  return;
                }
                setSizeValue(v);
                onTypeOrSizeChange?.(typeValue, v);
                onAutosave?.(form);
              }}
              className={lineCls}
            >
              <option value="">Choose from list…</option>
              {withCurrent(settings.sizePresets, sizeValue).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={ADD_NEW}>+ Add new…</option>
            </select>
          </div>
          {/* Available (qty) removed from the visible form (2026-09-11,
              direct request) — always a hidden input now, regardless of
              Type, so any existing value on record is preserved rather than
              silently cleared the next time this form autosaves. */}
          <input type="hidden" name="availableQty" value={values.availableQty} />
          {children}
          <div>
            <label className={labelCls}>Location</label>
            <div className="flex gap-1">
              <select
                name="location"
                value={locationValue}
                onChange={(e) => {
                  const v = e.target.value;
                  const form = e.currentTarget.form!;
                  if (v === ADD_NEW) {
                    addNew("Location", onAddLocation, setLocationValue, form, onLocationChange);
                    return;
                  }
                  setLocationValue(v);
                  onLocationChange?.(v);
                  onAutosave?.(form);
                }}
                className={`${lineCls} min-w-0`}
              >
                <option value="">Choose from list…</option>
                {withCurrent(
                  settings.locations.map((l) => l.name),
                  locationValue
                ).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value={ADD_NEW}>+ Add new…</option>
              </select>
              {onViewLocation && (
                <button
                  type="button"
                  onClick={onViewLocation}
                  className={`shrink-0 rounded-md border border-neutral-300 px-3 text-sm text-neutral-600 hover:bg-neutral-50 ${FIELD_HEIGHT}`}
                >
                  View
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Medium</label>
        <select
          name="medium"
          value={mediumValue}
          onChange={(e) => {
            const v = e.target.value;
            const form = e.currentTarget.form!;
            if (v === ADD_NEW) {
              addNew("Medium", onAddMedium, setMediumValue, form);
              return;
            }
            setMediumValue(v);
            onAutosave?.(form);
          }}
          className={lineCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.mediumPresets, mediumValue).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new…</option>
        </select>
      </div>
      <div className="rounded-md border border-neutral-200 p-3">
        <p className={labelCls}>
          Studio notes <span className="font-normal text-neutral-400">(private)</span>
        </p>
        <div className="mb-3 w-1/2">
          <label className={labelCls}>Date</label>
          <input
            type="text"
            name="date"
            defaultValue={values.date}
            placeholder="e.g. June 2025"
            onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
            className={lineCls}
          />
        </div>
        <label className={labelCls}>Notes</label>
        <textarea
          name="studioNotes"
          defaultValue={values.studioNotes}
          onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
          rows={5}
          className={inputCls}
        />
      </div>
    </>
  );
}
