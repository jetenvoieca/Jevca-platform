"use client";

import type { CurationSummary } from "@/lib/actions/curations";

// The artwork filters (Curation, Name, Location, Type) — shared by the
// Artwork Catalogue and the Media Catalogue's Artworks view (2026-10-15)
// so both filter the same way. Controlled: the parent holds the values
// and is told which one changed.
export type ArtworkFilterValues = {
  curation: string;
  name: string;
  location: string;
  type: string;
};

export default function ArtworkFilterBar({
  values,
  curations,
  names,
  locations,
  types,
  onChange,
}: {
  values: ArtworkFilterValues;
  curations: CurationSummary[];
  names: string[];
  locations: string[];
  types: string[];
  onChange: (change: Partial<ArtworkFilterValues>) => void;
}) {
  const selectCls = "rounded-md border border-neutral-300 px-2 py-[4.8px] text-sm";
  return (
    <div className="flex flex-wrap items-center gap-3">
      {curations.length > 0 && (
        <select
          name="curation"
          value={values.curation}
          onChange={(e) => onChange({ curation: e.target.value })}
          className={selectCls}
        >
          <option value="">All curations</option>
          {curations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Shows every work with that name, whatever its type. A chosen
            name no longer in the list (just renamed) stays shown, so the
            box never silently reads "All names". */}
        <select
          name="name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={`max-w-56 ${selectCls}`}
        >
          <option value="">All names</option>
          {values.name && !names.includes(values.name) && (
            <option value={values.name}>{values.name}</option>
          )}
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          name="location"
          value={values.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className={selectCls}
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          name="type"
          value={values.type}
          onChange={(e) => onChange({ type: e.target.value })}
          className={selectCls}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
