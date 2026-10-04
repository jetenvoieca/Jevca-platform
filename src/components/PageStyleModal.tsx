"use client";

import { useState } from "react";
import { PAGE_STYLE_TYPES } from "@/lib/pageStyleTypes";
import type { PageStyleInput } from "@/lib/actions/pageStyles";

// Templates → Page Styles' Add / Edit modal (2026-10-04, from Craig's
// mockup): Style name and Style Type. The chosen type's layout controls
// are added to this modal in the next step.
export default function PageStyleModal({
  heading,
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  heading: string;
  initial: PageStyleInput;
  saving: boolean;
  error: string | null;
  onSave: (input: PageStyleInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, type });
        }}
      >
        <h3 className="sr-only">{heading}</h3>

        <div className="mb-6 flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Style name"
            aria-label="Style name"
            autoFocus
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Style Type"
            className={`w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base ${
              type ? "text-neutral-900" : "text-neutral-400"
            }`}
          >
            <option value="" disabled>
              Style Type
            </option>
            {PAGE_STYLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !type}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
