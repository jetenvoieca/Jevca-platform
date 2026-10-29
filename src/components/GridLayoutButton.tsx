"use client";

import { useEffect, useState } from "react";

// The one layout button for a catalogue grid (2026-10-17, direct request
// — less clutter for something rarely changed; the Media Catalogue too
// since 2026-10-29): each click goes to the next of tiles 3, 5, 7 and 9
// to a row, then the list, then back. Remembered on this browser under
// `storageKey` ("list" or the number per row).

const PER_ROW = [3, 5, 7, 9] as const;
type PerRow = (typeof PER_ROW)[number];
export type GridLayout = { view: "tile" | "list"; perRow: PerRow };

export function useGridLayout(storageKey: string) {
  const [layout, setLayout] = useState<GridLayout>({ view: "tile", perRow: 5 });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "list") {
        setLayout((l) => ({ ...l, view: "list" }));
        return;
      }
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (PER_ROW.includes(parsed as PerRow)) setLayout({ view: "tile", perRow: parsed as PerRow });
    } catch {
      // No storage here — the default layout stays.
    }
  }, [storageKey]);

  const next = () => {
    const at = PER_ROW.indexOf(layout.perRow);
    const toList = layout.view === "tile" && at === PER_ROW.length - 1;
    const nextLayout: GridLayout = toList
      ? { ...layout, view: "list" }
      : { view: "tile", perRow: layout.view === "list" ? PER_ROW[0] : PER_ROW[Math.min(at + 1, PER_ROW.length - 1)] };
    setLayout(nextLayout);
    try {
      window.localStorage.setItem(storageKey, nextLayout.view === "list" ? "list" : String(nextLayout.perRow));
    } catch {
      // Not remembered — fine.
    }
  };

  return { ...layout, next };
}

export default function GridLayoutButton({
  layout,
  onClick,
}: {
  layout: GridLayout;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={layout.view === "list" ? "List — click for tiles" : `${layout.perRow} to a row — click to change`}
      aria-label="Change layout"
      className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-[4.8px] text-sm text-neutral-700 hover:bg-neutral-50"
    >
      {layout.view === "list" ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
          <rect x="1" y="2" width="14" height="2" rx="0.5" />
          <rect x="1" y="7" width="14" height="2" rx="0.5" />
          <rect x="1" y="12" width="14" height="2" rx="0.5" />
        </svg>
      ) : (
        <>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
          {layout.perRow}
        </>
      )}
    </button>
  );
}
