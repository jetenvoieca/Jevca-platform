"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePage, reorderPages } from "@/lib/actions/pages";

export type PageListItem = { id: string; title: string; visible: boolean };

type ListKey = "live" | "hidden";

// Website → Pages (2026-10-04, from Craig's mockup): a Preview panel on
// the left; on the right, Add / Edit / Delete above two lists, Live Pages
// and Hidden Pages. Clicking a page selects it — Edit and Delete act on
// the selected page. Pages are dragged to reorder within a list or moved
// between the two (moving one changes whether it's live). Every drop
// saves both lists at once via reorderPages.
//
// Add / Edit (the page modal) and the Preview's contents are later steps.
export default function PagesManager({
  siteId,
  pages,
}: {
  siteId: string;
  pages: PageListItem[];
}) {
  const [live, setLive] = useState(() => pages.filter((p) => p.visible));
  const [hidden, setHidden] = useState(() => pages.filter((p) => !p.visible));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<{ id: string; from: ListKey } | null>(null);
  // Where the dragged page would land: before `beforeId` in `list`, or at
  // the end of `list` when beforeId is null.
  const [dropTarget, setDropTarget] = useState<{ list: ListKey; beforeId: string | null } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // Fresh server data (after a delete, or any refresh) replaces local state.
  useEffect(() => {
    setLive(pages.filter((p) => p.visible));
    setHidden(pages.filter((p) => !p.visible));
  }, [pages]);

  const selected = [...live, ...hidden].find((p) => p.id === selectedId) ?? null;

  const handleDrop = () => {
    if (!dragged || !dropTarget) return;
    // Dropped back onto its own spot — nothing to change.
    if (dropTarget.beforeId === dragged.id) {
      setDragged(null);
      setDropTarget(null);
      return;
    }
    const source = dragged.from === "live" ? live : hidden;
    const page = source.find((p) => p.id === dragged.id);
    if (!page) return;

    const remove = (list: PageListItem[]) => list.filter((p) => p.id !== page.id);
    const insert = (list: PageListItem[]) => {
      const moved = { ...page, visible: dropTarget.list === "live" };
      const without = remove(list);
      const index =
        dropTarget.beforeId === null
          ? without.length
          : without.findIndex((p) => p.id === dropTarget.beforeId);
      return [...without.slice(0, index), moved, ...without.slice(index)];
    };

    const nextLive = dropTarget.list === "live" ? insert(live) : remove(live);
    const nextHidden = dropTarget.list === "hidden" ? insert(hidden) : remove(hidden);

    setLive(nextLive);
    setHidden(nextHidden);
    setDragged(null);
    setDropTarget(null);

    startTransition(() =>
      reorderPages(
        siteId,
        nextLive.map((p) => p.id),
        nextHidden.map((p) => p.id)
      )
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}"? This can't be undone.`)) return;
    setSelectedId(null);
    startTransition(() => deletePage(siteId, selected.id));
  };

  const renderList = (key: ListKey, title: string, items: PageListItem[]) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // Only claim the end-of-list spot when not over a specific row —
        // a row's own handler sets a more precise target.
        if (e.target === e.currentTarget) setDropTarget({ list: key, beforeId: null });
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop();
      }}
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3"
    >
      <h2 className="mb-3 text-center text-base text-neutral-800">{title}</h2>
      <div
        className="flex flex-1 flex-col gap-1 overflow-y-auto"
        onDragOver={(e) => {
          if (e.target === e.currentTarget) setDropTarget({ list: key, beforeId: null });
        }}
      >
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-neutral-400">
            {key === "live" ? "No live pages." : "No hidden pages."}
          </p>
        )}
        {items.map((p) => {
          const showLine = dropTarget?.list === key && dropTarget.beforeId === p.id;
          return (
            <div key={p.id}>
              {showLine && <div className="mb-1 h-0.5 rounded bg-neutral-900" />}
              <button
                type="button"
                draggable
                onDragStart={() => setDragged({ id: p.id, from: key })}
                onDragEnd={() => {
                  setDragged(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget({ list: key, beforeId: p.id });
                }}
                onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                className={`w-full cursor-grab truncate rounded-md border px-3 py-2 text-left text-sm active:cursor-grabbing ${
                  p.id === selectedId
                    ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                    : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                } ${dragged?.id === p.id ? "opacity-40" : ""}`}
              >
                {p.title}
              </button>
            </div>
          );
        })}
        {dropTarget?.list === key && dropTarget.beforeId === null && dragged && (
          <div className="h-0.5 rounded bg-neutral-900" />
        )}
      </div>
    </div>
  );

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">Preview</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-400">
            {selected ? selected.title : "Select a page to preview it."}
          </p>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled
            title="Coming in the next step"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            disabled
            title="Coming in the next step"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selected || isPending}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete
          </button>
        </div>

        {renderList("live", "Live Pages", live)}
        {renderList("hidden", "Hidden Pages", hidden)}
      </aside>
    </div>
  );
}
