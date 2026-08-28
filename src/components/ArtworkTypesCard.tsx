"use client";

import { useRef, useState, useTransition } from "react";
import {
  addArtworkType,
  removeArtworkType,
  updateArtworkTypeRefValue,
} from "@/lib/actions/artworkSettings";

export type ArtworkTypeRecord = { id: string; name: string; refValue: string };

// Same card shape/styling as SettingsListCard, but each row also carries
// an editable Ref value (2026-08-28) — used to compute a suggested
// Reference price on the Catalogue tab: (Size preset's width × height)
// × this number. Kept as its own component rather than a variant of
// SettingsListCard, since that component's rows are single plain
// strings and Types now need a second, independently-saved field per
// row.
export default function ArtworkTypesCard({
  artistId,
  siteId,
  types,
}: {
  artistId: string;
  siteId: string;
  types: ArtworkTypeRecord[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Local echo of each row's Ref value box (2026-08-28) — so typing
  // doesn't feel laggy waiting on a round trip, same pattern as the
  // live instalment-price preview elsewhere in this app. Keyed by
  // type id; falls back to the server value until edited.
  const [liveRefValues, setLiveRefValues] = useState<Record<string, string>>({});

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">Types</h3>
      <p className="mb-3 text-xs text-neutral-500">
        Offered in the Type dropdown on every Catalogue entry. Ref value (0.5–2.0) is used to
        suggest a Reference price: Size area × Ref value.
      </p>

      <div className="mb-3 flex flex-col gap-2">
        {types.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <span className="flex-1">{t.name}</span>
            <input
              type="number"
              min={0.5}
              max={2}
              step={0.01}
              value={liveRefValues[t.id] ?? t.refValue}
              onChange={(e) =>
                setLiveRefValues((prev) => ({ ...prev, [t.id]: e.target.value }))
              }
              onBlur={(e) =>
                startTransition(() =>
                  updateArtworkTypeRefValue(artistId, siteId, t.id, e.target.value)
                )
              }
              disabled={isPending}
              className="w-20 shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => removeArtworkType(artistId, siteId, t.id))}
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {types.length === 0 && <p className="text-xs text-neutral-400">Nothing added yet.</p>}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addArtworkType(artistId, siteId, formData);
            formRef.current?.reset();
          });
        }}
        className="flex items-start gap-2"
      >
        <input
          type="text"
          name="name"
          required
          placeholder="New type…"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
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
