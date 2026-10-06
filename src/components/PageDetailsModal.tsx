"use client";

import { useState } from "react";
import type { CurationSummary } from "@/lib/actions/curations";
import type { PageDetailsInput } from "@/lib/actions/pages";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { MenuStyleSummary } from "@/lib/actions/menuStyles";

// The Pages page's Add / Edit modal (2026-10-04, from Craig's mockup):
// Page Name, Curation and Display Style. The same modal is used for both
// — Edit opens it filled in with the selected page. Display Style is
// one of the Page Styles (Templates → Page Styles, 2026-10-05). With a
// Canvas style there's no Curation to choose — a Canvas page has its own
// placed curations (Arrange on the Pages page) — so it's hidden and
// saved as none. Menu (2026-10-06) is "Site menu" (the one chosen under
// Live Pages) or one of the Menu Styles, for this page only.
export default function PageDetailsModal({
  heading,
  initial,
  curations,
  pageStyles,
  menuStyles,
  saving,
  error,
  onSave,
  onCancel,
}: {
  heading: string;
  initial: PageDetailsInput;
  curations: CurationSummary[];
  pageStyles: PageStyleSummary[];
  menuStyles: MenuStyleSummary[];
  saving: boolean;
  error: string | null;
  onSave: (input: PageDetailsInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [curationId, setCurationId] = useState(initial.curationId ?? "");
  const [pageStyleId, setPageStyleId] = useState(initial.pageStyleId ?? "");
  const [menuStyleId, setMenuStyleId] = useState(initial.menuStyleId ?? "");

  const isCanvas = pageStyles.find((s) => s.id === pageStyleId)?.type === "CANVAS";

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
          onSave({
            title,
            curationId: isCanvas ? null : curationId || null,
            pageStyleId: pageStyleId || null,
            menuStyleId: menuStyleId || null,
          });
        }}
      >
        <h3 className="sr-only">{heading}</h3>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page Name"
          aria-label="Page Name"
          autoFocus
          className="mb-6 w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />

        <div className="mb-6 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-4">
          {!isCanvas && (
            <>
              <label htmlFor="page-curation" className="text-sm text-neutral-700">
                Curation
              </label>
              <select
                id="page-curation"
                value={curationId}
                onChange={(e) => setCurationId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {curations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="page-display-style" className="text-sm text-neutral-700">
            Display Style
          </label>
          <select
            id="page-display-style"
            value={pageStyleId}
            onChange={(e) => setPageStyleId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {pageStyles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label htmlFor="page-menu" className="text-sm text-neutral-700">
            Menu
          </label>
          <select
            id="page-menu"
            value={menuStyleId}
            onChange={(e) => setMenuStyleId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">Site menu</option>
            {menuStyles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {isCanvas && (
          <p className="mb-4 text-xs text-neutral-500">
            A Canvas page&apos;s curations are placed with Arrange.
          </p>
        )}

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
            disabled={saving || !title.trim()}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
