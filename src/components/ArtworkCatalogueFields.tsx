"use client";

import { useState } from "react";
import type { ArtworkSettings } from "@/components/ArtworkDetailPanel";

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
  availability: string;
};

// Vertical padding cut ~20% (2026-09-11, direct request — "catalogue
// will be a high usage area") — py-2 (8px) down to 6.4px via an
// arbitrary value, since no standard Tailwind step lands on exactly
// 20% less. Horizontal padding untouched; only height was asked for.
const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-[6.4px] text-sm";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

// Sentinel option value for "+ Add new…" (2026-09-11) — never a real
// preset name, so it can never collide with one. Selecting it never
// actually gets submitted: the onChange handlers below intercept it,
// prompt for a name, and swap the select's value over to the real new
// entry before anything autosaves.
const ADD_NEW = "__add_new__";

// The Type / Medium / Size / Edition / Location / Date / Availability /
// Studio notes block — one shared component (2026-09-07, direct request)
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
// row. `children`, if given, renders between Date and Availability so
// the Catalogue tab can slot its price fields into the middle of the
// grid.
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
  children,
  availabilityOverride,
  onAddType,
  onAddMedium,
  onAddLocation,
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
  children?: React.ReactNode;
  // Replaces the default Availability <select> (2026-09-10) — the
  // Catalogue tab swaps in its own Available/SOLD control, shown for
  // every Type, editions included; the Hopper's quick-add passes a
  // hidden AVAILABLE, since a new artwork always starts available.
  availabilityOverride?: React.ReactNode;
  // Inline "add new preset" support (2026-09-11, direct request — "all
  // drop-downs add ability to add to lists"). Each is a small async
  // action that actually persists the new value to the artist's own
  // Settings list (Type has its own table with a Ref value, so it's a
  // distinct action from the plain string-list fields — see
  // artworkSettings.ts). Omit any of these to leave that particular
  // select as a plain, fixed-list picker — Hopper's quick-add form
  // doesn't pass any of them, so its selects are unaffected.
  //
  // onAddLocation (2026-09-22) — persists to the Location model (see
  // actions/locations.ts); the caller (ArtworkDetailPanel) decides the
  // new Location's Type (Gallery/Own) before persisting, so this
  // component itself stays agnostic to that.
  onAddType?: (name: string) => Promise<void>;
  onAddMedium?: (name: string) => Promise<void>;
  onAddLocation?: (name: string) => Promise<void>;
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
    persist: ((name: string) => Promise<void>) | undefined,
    setValue: (v: string) => void,
    form: HTMLFormElement,
    andAlsoSetType?: (type: string) => void
  ) => {
    const entered = window.prompt(`Add a new ${label}:`)?.trim();
    if (!entered) return;
    persist?.(entered);
    setValue(entered);
    andAlsoSetType?.(entered);
    setTimeout(() => onAutosave?.(form), 0);
  };

  return (
    <>
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
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.artworkTypes, typeValue).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {onAddType && <option value={ADD_NEW}>+ Add new…</option>}
        </select>
      </div>
      <div className="col-span-2">
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
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.mediumPresets, mediumValue).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {onAddMedium && <option value={ADD_NEW}>+ Add new…</option>}
        </select>
      </div>
      <div>
        <label className={labelCls}>Size</label>
        <select
          name="size"
          value={sizeValue}
          onChange={(e) => {
            setSizeValue(e.target.value);
            onTypeOrSizeChange?.(typeValue, e.target.value);
            onAutosave?.(e.currentTarget.form!);
          }}
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.sizePresets, values.size).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {/* Edition only applies to editioned work — Originals and Uniques
          (and materials like Aluminium that aren't editioned) are
          one-offs (2026-08-15 decision). */}
      {isEditionType ? (
        <div>
          <label className={labelCls}>Edition</label>
          <input
            type="text"
            name="edition"
            defaultValue={values.edition}
            onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
            className={inputCls}
          />
        </div>
      ) : (
        // Preserve any Edition value already on record rather than
        // wiping it out just because Type changed — it'll reappear if
        // switched back.
        <input type="hidden" name="edition" value={values.edition} />
      )}
      {/* Available (qty) removed from the visible form (2026-09-11,
          direct request) — always a hidden input now, regardless of
          Type, so any existing value on record is preserved rather than
          silently cleared the next time this form autosaves. */}
      <input type="hidden" name="availableQty" value={values.availableQty} />
      <div>
        <label className={labelCls}>Location</label>
        <select
          name="location"
          value={locationValue}
          onChange={(e) => {
            const v = e.target.value;
            const form = e.currentTarget.form!;
            if (v === ADD_NEW) {
              addNew("Location", onAddLocation, setLocationValue, form);
              return;
            }
            setLocationValue(v);
            onAutosave?.(form);
          }}
          className={inputCls}
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
          {onAddLocation && <option value={ADD_NEW}>+ Add new…</option>}
        </select>
      </div>
      {/* A plain single-column cell (2026-09-12, direct request — "date
          field too long, shorten and reposition") — sits right next to
          Location in the same row, at the same width as every other
          field. */}
      <div>
        <label className={labelCls}>Date</label>
        <input
          type="text"
          name="date"
          defaultValue={values.date}
          placeholder="e.g. June 2025"
          onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
          className={inputCls}
        />
      </div>
      {children}
      {availabilityOverride ??
        (!isEditionType ? (
          <div>
            <label className={labelCls}>Availability</label>
            <select
              name="availability"
              defaultValue={values.availability}
              onChange={(e) => onAutosave?.(e.currentTarget.form!)}
              className={inputCls}
            >
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
            </select>
          </div>
        ) : (
          <input type="hidden" name="availability" value={values.availability} />
        ))}
      <div className="col-span-2">
        <label className={labelCls}>
          Studio notes <span className="font-normal text-neutral-400">(private)</span>
        </label>
        <textarea
          name="studioNotes"
          defaultValue={values.studioNotes}
          onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
          rows={3}
          className={inputCls}
        />
      </div>
    </>
  );
}
