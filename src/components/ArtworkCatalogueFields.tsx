"use client";

import { useState } from "react";
import type { ArtworkSettings } from "@/components/ArtworkDetailPanel";

// Keeps a select from silently dropping an existing value that isn't (yet)
// in the preset list — e.g. legacy data typed in before Settings existed.
export function withCurrent(presets: string[], current: string | null) {
  if (!current || presets.includes(current)) return presets;
  return [current, ...presets];
}

export type ArtworkFacetValues = {
  type: string;
  catalogueGroup: string;
  medium: string;
  size: string;
  edition: string;
  // Kept as a string here (not number | null) since this is always read
  // straight off a form field — callers convert to/from a number at
  // their own DB boundary.
  availableQty: string;
  location: string;
  // Free text (e.g. "June 2025") — see the matching note on
  // Artwork.date in schema.prisma.
  date: string;
  studioNotes: string;
  availability: string;
};

const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

// The Type / Group / Medium / Size / Edition / Available (qty) /
// Location / Date / Availability / Studio notes block — one shared
// component (2026-09-07, direct request) used by both the full Artwork
// editor's Catalogue tab (ArtworkDetailPanel) and the Hopper's quick-add
// form (HopperView/QuickCatalogueFields). These two had drifted into
// separately-maintained copies — the Hopper version was missing Edition
// and Available (qty) entirely, and showed Availability unconditionally
// — which is exactly the kind of drift that causes costly mistakes.
// Unifying them here means a future field change only has to happen
// once.
//
// Name and Tier (Catalogue-tab-only — Tier is a curatorial/pricing
// category set once cataloguing is done, not at Hopper quick-add time)
// and Reference/Offered price (also Catalogue-only — a brand-new
// Hopper-created artwork is never priced at creation) stay outside this
// component. `children`, if given, renders between Date and
// Availability so the Catalogue tab can still slot its price fields
// into the middle of the grid, in the same position as before.
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
  afterLocation,
  availabilityOverride,
}: {
  settings: Pick<
    ArtworkSettings,
    "artworkTypes" | "artworkGroups" | "mediumPresets" | "sizePresets" | "artworkLocations"
  >;
  values: ArtworkFacetValues;
  // Fired (with the enclosing form) after a field changes, for callers
  // that want to autosave immediately — the Catalogue tab's
  // autosaveCatalogue. Omit for a plain uncontrolled form only read on
  // submit — the Hopper's quick-add, where the artwork doesn't exist
  // yet to save to.
  onAutosave?: (form: HTMLFormElement) => void;
  // Fired on Type or Size change specifically, so a caller with its own
  // live Reference price preview (Catalogue tab only) can recompute it.
  onTypeOrSizeChange?: (type: string, size: string) => void;
  children?: React.ReactNode;
  // Full-width (col-span-2) slot rendered right after Location, before
  // Date (2026-09-10, direct request) — the Catalogue tab's own sale
  // panel opens exactly here, regardless of where its trigger
  // (availabilityOverride, below) actually sits further down the form.
  // Omitted entirely by any caller that doesn't pass it (Hopper).
  afterLocation?: React.ReactNode;
  // Replaces the default Availability <select> for non-edition types
  // only (2026-09-10) — the Catalogue tab uses this to swap in its own
  // Available/SOLD toggle; Hopper leaves it unset and keeps the plain
  // select. Edition types are unaffected either way — they always keep
  // tracking availability via Available (qty) instead, same as before.
  availabilityOverride?: React.ReactNode;
}) {
  const [typeValue, setTypeValue] = useState(values.type);
  const [sizeValue, setSizeValue] = useState(values.size);
  // Original/Unique pieces don't have editions the way prints do — both
  // forms show a simpler set of fields for them. Tracked live (not just
  // at load) so switching Type immediately shows/hides Edition/
  // Available (qty)/Availability. Substring rather than exact match,
  // since Type is free text from the artist's own preset list and can
  // be phrased several ways ("Edition", "Giclée Edition", "Limited
  // Edition").
  const isEditionType = typeValue.trim().toLowerCase().includes("edition");

  return (
    <>
      <div>
        <label className={labelCls}>Type</label>
        <select
          name="type"
          value={typeValue}
          onChange={(e) => {
            setTypeValue(e.target.value);
            onTypeOrSizeChange?.(e.target.value, sizeValue);
            onAutosave?.(e.currentTarget.form!);
          }}
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.artworkTypes, values.type).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Group</label>
        <select
          name="catalogueGroup"
          defaultValue={values.catalogueGroup}
          onChange={(e) => onAutosave?.(e.currentTarget.form!)}
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.artworkGroups, values.catalogueGroup).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Medium</label>
        <select
          name="medium"
          defaultValue={values.medium}
          onChange={(e) => onAutosave?.(e.currentTarget.form!)}
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.mediumPresets, values.medium).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
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
      {isEditionType ? (
        <div>
          <label className={labelCls}>Available (qty)</label>
          <input
            type="number"
            name="availableQty"
            defaultValue={values.availableQty}
            onBlur={(e) => onAutosave?.(e.currentTarget.form!)}
            className={inputCls}
          />
        </div>
      ) : (
        <input type="hidden" name="availableQty" value={values.availableQty} />
      )}
      <div>
        <label className={labelCls}>Location</label>
        <select
          name="location"
          defaultValue={values.location}
          onChange={(e) => onAutosave?.(e.currentTarget.form!)}
          className={inputCls}
        >
          <option value="">Choose from list…</option>
          {withCurrent(settings.artworkLocations, values.location).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {afterLocation && <div className="col-span-2">{afterLocation}</div>}
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
      {!isEditionType ? (
        (availabilityOverride ?? (
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
        ))
      ) : (
        // Editions track availability via the numeric Available (qty)
        // field instead — this status only makes sense for a
        // one-of-a-kind piece. Required/non-nullable in the database,
        // so preserved via hidden input rather than left out of the
        // submitted form.
        <input type="hidden" name="availability" value={values.availability} />
      )}
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
