"use client";

import { useEffect, useState } from "react";
import { LAYOUT_BLOCK_TYPES, type LayoutBlockType } from "@/lib/pageStyleLayout";

export type BlockPlacement = "none" | "left" | "right";

const PLACEMENTS: { value: BlockPlacement; label: string }[] = [
  { value: "none", label: "Below" },
  { value: "left", label: "To left" },
  { value: "right", label: "To right" },
];

// Templates → Page Styles' Add block modal (2026-10-05, direct request —
// separate adding blocks from laying them out): choose where the new
// block goes — Below everything, or To left / To right of the last row
// — then pick the block, which adds it and closes the modal. Beside
// needs at least one block already in the layout.
export default function AddBlockModal({
  canPlaceBeside,
  onAdd,
  onClose,
}: {
  canPlaceBeside: boolean;
  onAdd: (type: LayoutBlockType, placement: BlockPlacement) => void;
  onClose: () => void;
}) {
  const [placement, setPlacement] = useState<BlockPlacement>("none");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-4 text-center text-base text-neutral-900">Add block</h3>

        <div className="mb-1 grid grid-cols-3 gap-1">
          {PLACEMENTS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={p.value !== "none" && !canPlaceBeside}
              onClick={() => setPlacement(p.value)}
              className={`rounded-md border px-2 py-1.5 text-sm disabled:opacity-30 ${
                placement === p.value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-800 hover:bg-neutral-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mb-4 text-center text-xs text-neutral-400">
          {placement === "none"
            ? "On its own row, below everything."
            : `Beside the last row, on its ${placement}.`}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_BLOCK_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onAdd(t.value, placement)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              + {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
