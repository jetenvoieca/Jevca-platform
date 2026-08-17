"use client";

import { useState } from "react";

// Lets the two header lines (artist name, subtitle) be overridden just
// for this one export — added 2026-08-17 so the same "Export PDF" covers
// whatever this particular export is for (a plain price list vs. e.g. "—
// Private Collection Preview") without needing several near-identical
// hard-coded templates. Same visual convention as ConfirmDialog.tsx.
// Values are session-only — nothing here is saved, matches the plain
// GET-download link this replaces exactly, just with two extra query
// params tacked on.
export default function ExportPdfDialog({
  open,
  defaultTitle,
  defaultSubtitle,
  onExport,
  onCancel,
}: {
  open: boolean;
  defaultTitle: string;
  defaultSubtitle: string;
  onExport: (title: string, subtitle: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-semibold text-neutral-900">Export PDF</h3>
        <p className="mb-4 text-sm text-neutral-600">
          Edit the two header lines just for this export — nothing here is saved.
        </p>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Header title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mb-5">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Subtitle</label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onExport(title.trim() || defaultTitle, subtitle.trim())}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
