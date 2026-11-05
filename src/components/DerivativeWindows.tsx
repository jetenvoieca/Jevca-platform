"use client";

import { useEffect, useState, useTransition } from "react";
import { duplicateArtwork, listDerivatives, setArtworkLocation, type DerivativeGroup } from "@/lib/actions/artworks";
import { isOpenEditionType, isOriginalType } from "@/lib/derivatives";
import FormModal from "@/components/FormModal";
import { inputCls, labelCls, primaryButtonCls } from "@/components/subscriberFormParts";

// A Base work's derivatives (2026-11-05, Craig's mockup — keeping track of
// editions and unsold stock; see lib/derivatives.ts), from the details
// panel's Studio notes:
// - Make Derivative: choose its Type (any but an Original); for a
//   numbered edition (not an open one), its number of how many — the size
//   filled in from this work's other derivatives of that Type, the number
//   with the next one not yet made.
// - View Derivatives: each Type's unsold derivatives — numbered ones as
//   "3 — where it is" in number order — sold ones left out. One with no
//   location can be given one there (2026-11-05).

function useDerivatives(artworkId: string) {
  const [groups, setGroups] = useState<DerivativeGroup[] | null>(null);
  useEffect(() => {
    let current = true;
    listDerivatives(artworkId).then((g) => {
      if (current) setGroups(g);
    });
    return () => {
      current = false;
    };
  }, [artworkId]);
  return groups;
}

// The lowest number not yet made, when there's one left.
function nextNumber(group: DerivativeGroup | undefined): number | null {
  if (!group?.size) return group ? null : 1;
  for (let n = 1; n <= group.size; n++) if (!group.usedNumbers.includes(n)) return n;
  return null;
}

export function MakeDerivativeModal({
  artworkId,
  siteId,
  types,
  onMade,
  onClose,
}: {
  artworkId: string;
  siteId: string;
  // The client's Types, by name.
  types: string[];
  onMade: (id: string) => void;
  onClose: () => void;
}) {
  const groups = useDerivatives(artworkId);
  const [type, setType] = useState("");
  const [number, setNumber] = useState("");
  const [size, setSize] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const choices = types.filter((t) => !isOriginalType(t));
  const numbered = !!type && !isOpenEditionType(type);

  const chooseType = (next: string) => {
    setType(next);
    setError(null);
    const group = groups?.find((g) => g.type === next);
    setSize(group?.size ? String(group.size) : "");
    const n = nextNumber(group);
    setNumber(n ? String(n) : "");
  };

  const make = () => {
    setError(null);
    startTransition(async () => {
      const result = await duplicateArtwork(artworkId, siteId, {
        type,
        number: numbered ? Number(number) : null,
        size: numbered ? Number(size) : null,
      });
      if ("error" in result) return setError(result.error);
      onMade(result.id);
    });
  };

  return (
    <FormModal title="Make Derivative" busy={isPending} onClose={onClose}>
      {!groups ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          <div>
            <label className={labelCls}>Type</label>
            <select value={type} onChange={(e) => chooseType(e.target.value)} className={inputCls}>
              <option value="" disabled>
                Choose…
              </option>
              {choices.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {numbered && (
            <div>
              <label className={labelCls}>Edition</label>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="number"
                  min={1}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  aria-label="Number"
                  placeholder="Number"
                  className={`${inputCls} w-24`}
                />
                of
                <input
                  type="number"
                  min={1}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  aria-label="Edition size"
                  placeholder="Edition"
                  className={`${inputCls} w-24`}
                />
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={make}
            disabled={isPending || !type || (numbered && (!number || !size))}
            className={primaryButtonCls}
          >
            {isPending ? "Making…" : "Make Derivative"}
          </button>
        </>
      )}
    </FormModal>
  );
}

export function ViewDerivativesModal({
  artworkId,
  locations,
  onClose,
}: {
  artworkId: string;
  // The client's Locations, by name.
  locations: string[];
  onClose: () => void;
}) {
  const groups = useDerivatives(artworkId);
  const shown = groups?.filter((g) => g.unsold.length > 0) ?? [];
  // Locations set here, by derivative.
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const place = (id: string, location: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setArtworkLocation(id, location);
      if ("error" in result) return setError(result.error);
      setPlaced((old) => ({ ...old, [id]: location }));
    });
  };

  return (
    <FormModal title="Derivatives" busy={false} onClose={onClose}>
      {!groups ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-neutral-500">No unsold derivatives.</p>
      ) : (
        shown.map((g) => (
          <div key={g.type} className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 text-sm font-medium text-neutral-900">
              {g.type}
              {!g.open && g.size ? ` (${g.size})` : ""}
            </p>
            <ul className="space-y-1 text-sm text-neutral-700">
              {g.unsold.map((d) => (
                <li key={d.id} className="grid grid-cols-[2.5rem_1fr] gap-2">
                  <span className="text-neutral-500">{g.open ? "" : (d.number ?? d.edition ?? "—")}</span>
                  {d.location || placed[d.id] ? (
                    <span>{d.location || placed[d.id]}</span>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => place(d.id, e.target.value)}
                      disabled={isPending}
                      aria-label="Location"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-500"
                    >
                      <option value="" disabled>
                        No location — choose…
                      </option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </FormModal>
  );
}
