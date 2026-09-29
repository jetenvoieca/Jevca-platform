"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWebsitePage, type WebsitePageSummary } from "@/lib/actions/website";

const ADD_PAGE = "__add__";
const HOME = "__home__";

// Editor for the business website, jetenvoieca.com (2026-09-29). Two
// columns, per the mockups: a large live preview on the left, and the
// fields for the selected page on the right, with the page dropdown at
// the top. The corner ⤢/⤡ button gives the preview the full width.
//
// Step 1: layout and page dropdown only. The Home and Content page
// previews and fields replace the placeholders in steps 2 and 3.
export default function WebsiteEditor({
  pages,
  selectedId,
}: {
  pages: WebsitePageSummary[];
  // null = the Home page.
  selectedId: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [adding, startAdding] = useTransition();

  function handleSelect(value: string) {
    if (value === ADD_PAGE) {
      startAdding(async () => {
        const { id } = await createWebsitePage();
        router.push(`/accounts/website/${id}`);
      });
      return;
    }
    router.push(value === HOME ? "/accounts/website" : `/accounts/website/${value}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-neutral-900">Jetenvoieca</h1>
      </div>

      <div
        className={`grid min-h-0 flex-1 ${expanded ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_360px]"}`}
      >
        <div className="relative h-full overflow-y-auto bg-neutral-50 p-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse preview" : "Expand preview"}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50"
          >
            {expanded ? "⤡" : "⤢"}
          </button>
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-md border border-dashed border-neutral-300 text-sm text-neutral-400">
            Preview
          </div>
        </div>

        {!expanded && (
          <div className="h-full overflow-y-auto border-l border-neutral-200 p-4">
            <select
              value={selectedId ?? HOME}
              onChange={(e) => handleSelect(e.target.value)}
              disabled={adding}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900"
            >
              <option value={HOME}>Home page</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={ADD_PAGE}>+ Add content page</option>
            </select>
            {adding && <p className="mt-2 text-sm text-neutral-500">Adding page…</p>}
            <p className="mt-4 text-sm text-neutral-400">
              {selectedId ? "Content page fields" : "Home page fields"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
