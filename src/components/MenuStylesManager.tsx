"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMenuStyle,
  deleteMenuStyle,
  duplicateMenuStyle,
  updateMenuStyle,
  type MenuStyleSummary,
} from "@/lib/actions/menuStyles";
import { DEFAULT_MENU_STYLE, MENU_KINDS } from "@/lib/menuStyleLayout";
import MenuStyleEditor, { type MenuStyleDraft } from "@/components/MenuStyleEditor";
import MenuStylePreview from "@/components/MenuStylePreview";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAutoSave } from "@/components/useAutoSave";

// Templates → Menus (2026-10-06, from Craig's request): the shared
// library of site menu designs, laid out like Page Styles — the Preview
// on the left; on the right, Add / Edit / Duplicate / Delete above the
// list of menus. Clicking a menu selects it — Edit, Duplicate and
// Delete act on it.
//
// Add and Edit swap the list for the editor panel (MenuStyleEditor),
// which stays open until Close. Every change shows in the Preview at
// once and saves itself shortly after (a new menu is created the first
// time it has a name — see useAutoSave).
export default function MenuStylesManager({ styles }: { styles: MenuStyleSummary[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuStyleDraft | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const autoSave = useAutoSave<MenuStyleDraft>({
    create: createMenuStyle,
    update: updateMenuStyle,
    cannotSave: (d) => (!d.name.trim() ? "Needs a name to save." : null),
    onSaved: (id) => {
      setSelectedId(id);
      router.refresh();
    },
  });

  const selected = styles.find((s) => s.id === selectedId) ?? null;

  const handleChange = (next: MenuStyleDraft) => {
    setDraft(next);
    autoSave.schedule(next);
  };

  const openEditor = (mode: "add" | "edit") => {
    autoSave.begin(mode === "edit" && selected ? selected.id : null);
    setListError(null);
    setDraft(
      mode === "edit" && selected
        ? { name: selected.name, layout: selected.layout }
        : { name: "", layout: DEFAULT_MENU_STYLE }
    );
  };

  // Saves anything still waiting before closing, so nothing is lost.
  const closeEditor = () => {
    startTransition(async () => {
      await autoSave.flush();
      setDraft(null);
    });
  };

  const handleDuplicate = () => {
    if (!selected) return;
    setListError(null);
    startTransition(async () => {
      const result = await duplicateMenuStyle(selected.id);
      if ("error" in result) {
        setListError(result.error);
        return;
      }
      setSelectedId(result.id);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(false);
    setSelectedId(null);
    startTransition(async () => {
      await deleteMenuStyle(selected.id);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  // While editing, the Preview shows the draft as it changes.
  const preview = draft
    ? { name: draft.name.trim() || "Untitled menu", layout: draft.layout }
    : selected;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">Preview</h2>
        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{preview.name}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MenuStylePreview layout={preview.layout} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a menu to preview it.</p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => openEditor("add")}
            disabled={!!draft || isPending}
            className={buttonClass}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => openEditor("edit")}
            disabled={!!draft || !selected || isPending}
            className={buttonClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={!!draft || !selected || isPending}
            className={buttonClass}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={!!draft || !selected || isPending}
            className={`${buttonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
          >
            Delete
          </button>
        </div>

        {draft ? (
          <MenuStyleEditor
            draft={draft}
            onChange={handleChange}
            status={isPending ? { text: "Saving…", isError: false } : autoSave.status}
            onClose={closeEditor}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
            <h2 className="mb-3 text-base text-neutral-800">Menus</h2>
            {listError && <p className="mb-2 text-xs text-red-600">{listError}</p>}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {styles.length === 0 && (
                <p className="py-4 text-center text-xs text-neutral-400">
                  No menus yet. Use Add to create one.
                </p>
              )}
              {styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                    s.id === selectedId
                      ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                      : "border-transparent text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {MENU_KINDS.find((k) => k.value === s.layout.kind)?.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={confirmingDelete && !!selected}
        title="Delete this menu?"
        message={`"${selected?.name ?? ""}" will be deleted. This can't be undone.`}
        confirmLabel="Delete menu"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
