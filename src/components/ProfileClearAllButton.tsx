"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { clearProfileCatalogue, type ProfileStoryRow } from "@/lib/actions/profileStories";
import { FIXED_ENTRIES, type FixedKind } from "@/lib/profileEntries";

// Clear all (2026-11-09, Craig's request): a button opening a window to
// tick what to clear from the Profile Catalogue — each fixed entry
// (emptied, so it no longer shows on a page) and All stories (deleted).
// Pictures and videos stay in the Media Catalogue. Shared by the admin's
// Profile Catalogue and the Artist App's Update CV, which style the
// button.

export default function ProfileClearAllButton({
  artistId,
  className,
  style,
  onCleared,
}: {
  artistId: string;
  className: string;
  style?: React.CSSProperties;
  // The catalogue as it now is.
  onCleared: (entries: ProfileStoryRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fixed, setFixed] = useState<FixedKind[]>([]);
  const [stories, setStories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const chosen = fixed.length > 0 || stories;

  const close = () => {
    if (isPending) return;
    setOpen(false);
    setFixed([]);
    setStories(false);
    setError(null);
  };

  const toggle = (kind: FixedKind, on: boolean) =>
    setFixed((prev) => (on ? [...prev, kind] : prev.filter((k) => k !== kind)));

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await clearProfileCatalogue(artistId, { fixed, stories }).catch(() => ({
        error: "Nothing was cleared — please try again.",
      }));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onCleared(result);
      setOpen(false);
      setFixed([]);
      setStories(false);
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style}>
        Clear all
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-1 text-lg font-semibold text-neutral-900">Clear all</h2>
              <p className="mb-4 text-sm text-neutral-600">Tick what to clear. It can&apos;t be undone.</p>
              <div className="mb-4 flex flex-col gap-3">
                {FIXED_ENTRIES.map((f) => (
                  <Tick
                    key={f.kind}
                    label={f.caption}
                    detail="Emptied, so it doesn't show."
                    checked={fixed.includes(f.kind)}
                    onChange={(on) => toggle(f.kind, on)}
                  />
                ))}
                <Tick
                  label="All stories"
                  detail="Deleted. Their pictures and videos stay in the Media Catalogue."
                  checked={stories}
                  onChange={setStories}
                />
              </div>
              {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={!chosen || isPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {isPending ? "Clearing…" : "Clear"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Tick({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
      />
      <span>
        <span className="block text-sm font-medium text-neutral-900">{label}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </label>
  );
}
