"use client";

import { useRef, useState, useTransition } from "react";
import {
  createLocation,
  renameLocationByCustomer,
  deleteLocation,
  type LocationSummary,
  type LocationType,
} from "@/lib/actions/locations";

// Same card shape/styling as SettingsListCard and ArtworkTypesCard, but
// each row also carries a Type (2026-09-22) — Gallery (third-party) or
// Own (the artist's own stock: studio, storage, framer). Replaces the
// old plain-string "Locations" SettingsListCard: every entry here is a
// real Location, backed by its own Customer record (contact details for
// a Gallery, commission fixed at 0% for Own — see Location in
// schema.prisma), so it's also what the Artwork Catalogue's Location
// dropdown and the "Sold" button's routing both read from.
export default function LocationsCard({
  artistId,
  siteId,
  locations,
}: {
  artistId: string;
  siteId: string;
  locations: LocationSummary[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [newType, setNewType] = useState<LocationType>("GALLERY");
  const [error, setError] = useState<string | null>(null);

  const handleRename = (loc: LocationSummary, value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === loc.name) return;
    startTransition(async () => {
      const result = await renameLocationByCustomer(loc.customerId, siteId, trimmed);
      if ("error" in result) setError(result.error);
      else setError(null);
    });
  };

  const handleDelete = (loc: LocationSummary) => {
    if (
      !confirm(
        loc.type === "GALLERY"
          ? `Remove "${loc.name}"? This removes the contact record only — its sales stay exactly as they are. Can't be undone.`
          : `Remove "${loc.name}"? Can't be undone.`
      )
    )
      return;
    startTransition(() => deleteLocation(loc.id, siteId));
  };

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">
        Locations
      </h3>
      <p className="mb-3 text-xs text-neutral-500">
        Offered in the Location dropdown, and where "Sold" routes to. Gallery = a third-party
        gallery (its own contact details, commission, consigned works). Own = anywhere you keep
        your own stock (studio, storage, framer) — no commission.
      </p>

      <div className="mb-3 flex flex-col gap-2">
        {locations.map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <input
              type="text"
              defaultValue={l.name}
              disabled={isPending}
              onBlur={(e) => handleRename(l, e.target.value)}
              className="flex-1 rounded-md border border-transparent px-1 py-0.5 hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
            />
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                l.type === "GALLERY"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-neutral-200 text-neutral-600"
              }`}
            >
              {l.type === "GALLERY" ? "Gallery" : "Own"}
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleDelete(l)}
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {locations.length === 0 && <p className="text-xs text-neutral-400">Nothing added yet.</p>}
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <form
        ref={formRef}
        action={(formData) => {
          const name = (formData.get("name") as string)?.trim();
          if (!name) return;
          setError(null);
          startTransition(async () => {
            const result = await createLocation(artistId, siteId, name, newType);
            if ("error" in result) setError(result.error);
            else formRef.current?.reset();
          });
        }}
        className="flex items-start gap-2"
      >
        <input
          type="text"
          name="name"
          required
          placeholder="New location…"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as LocationType)}
          className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
        >
          <option value="GALLERY">Gallery</option>
          <option value="OWN">Own</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
