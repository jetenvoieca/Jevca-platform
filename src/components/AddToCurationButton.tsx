"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addWorksToCuration,
  curationsWithWork,
  listCurations,
  type CurationSummary,
} from "@/lib/actions/curations";
import { useBackdropClose } from "@/lib/useBackdropClose";

// Add to curation (2026-11-01, Craig's mockup) — in the Artwork Catalogue's
// Studio notes. The button names the curations the work is in (or says
// Curation when it's in none); it opens a list of the client's
// curations, those the work is already in greyed; choosing one adds the
// work to the end of it.
//
// For a work not created yet (the Hopper's new-artwork form, `artworkId`
// null), choosing a curation only marks it: the choices go with the form
// as `curationIds`, and the work is added to them once it's created.
// `alsoInto`: a curation it goes into anyway, named on the button (an
// imported work's portfolio section — see addToPortfolioCuration).
export default function AddToCurationButton({
  artistId,
  artworkId,
  artworkName,
  alsoInto = null,
  className = "",
}: {
  artistId: string;
  artworkId: string | null;
  artworkName: string;
  alsoInto?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [curations, setCurations] = useState<CurationSummary[] | null>(null);
  const [inIds, setInIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => setOpen(false);
  const backdrop = useBackdropClose(close);

  // Which curations it's in, for the button — loaded with the work.
  useEffect(() => {
    let cancelled = false;
    setCurations(null);
    setInIds([]);
    Promise.all([
      listCurations(artistId),
      artworkId ? curationsWithWork(artistId, artworkId) : Promise.resolve<string[]>([]),
    ]).then(([list, already]) => {
      if (cancelled) return;
      setCurations(list);
      setInIds(already);
    });
    return () => {
      cancelled = true;
    };
  }, [artistId, artworkId]);

  const inNames = [
    ...new Set([
      ...(alsoInto ? [alsoInto] : []),
      ...(curations ?? []).filter((c) => inIds.includes(c.id)).map((c) => c.name),
    ]),
  ];
  const label = inNames.length > 0 ? inNames.join(", ") : "Curation";

  const show = () => {
    setOpen(true);
    setError(null);
    setAddedTo(null);
  };

  const add = (curation: CurationSummary) => {
    setError(null);
    if (!artworkId) {
      setInIds((prev) => [...prev, curation.id]);
      setAddedTo(curation.name);
      return;
    }
    startTransition(async () => {
      const result = await addWorksToCuration(curation.id, artistId, [artworkId]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInIds((prev) => [...prev, curation.id]);
      setAddedTo(curation.name);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={inNames.length > 0 ? `In ${label} — add to another` : undefined}
        className={`truncate rounded-md border border-neutral-400 px-3 text-sm text-neutral-700 hover:bg-neutral-50 ${className}`}
      >
        {label}
      </button>
      {!artworkId && inIds.map((id) => <input key={id} type="hidden" name="curationIds" value={id} />)}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" {...backdrop}>
          <div className="flex max-h-full w-full max-w-sm flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-lg text-neutral-900">Add to curation — {artworkName}</h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {addedTo && (
                <p className="px-3 py-2 text-sm text-green-700">
                  {artworkId ? `Added to ${addedTo}.` : `It goes into ${addedTo} once created.`}
                </p>
              )}
              {curations === null ? (
                <p className="p-3 text-sm text-neutral-400">Loading…</p>
              ) : curations.length === 0 ? (
                <p className="p-3 text-sm text-neutral-400">No curations yet — add one on the Curations page.</p>
              ) : (
                curations.map((c) => {
                  const already = inIds.includes(c.id) || c.name === alsoInto;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => add(c)}
                      disabled={already || isPending}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:hover:bg-transparent"
                    >
                      <span className={already ? "text-neutral-400" : ""}>{c.name}</span>
                      {already && <span className="text-xs text-neutral-400">Already in</span>}
                    </button>
                  );
                })
              )}
              {error && <p className="p-3 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
