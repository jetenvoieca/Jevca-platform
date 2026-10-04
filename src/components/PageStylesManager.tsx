"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPageStyle,
  deletePageStyle,
  updatePageStyle,
  type PageStyleInput,
  type PageStyleSummary,
} from "@/lib/actions/pageStyles";
import { pageStyleTypeLabel } from "@/lib/pageStyleTypes";
import PageStyleModal from "@/components/PageStyleModal";
import ConfirmDialog from "@/components/ConfirmDialog";

// Templates → Page Styles (2026-10-04, from Craig's mockup): Add / Edit /
// Delete above the list of styles. Clicking a style selects it — Edit and
// Delete act on the selected style. Add and Edit open the same modal
// (PageStyleModal). The left-hand panel will preview the selected
// style's layout (a later step).
export default function PageStylesManager({ styles }: { styles: PageStyleSummary[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = styles.find((s) => s.id === selectedId) ?? null;

  const openModal = (mode: "add" | "edit") => {
    setModalError(null);
    setModal(mode);
  };

  const handleSave = (input: PageStyleInput) => {
    startTransition(async () => {
      if (modal === "add") {
        const result = await createPageStyle(input);
        if ("error" in result) {
          setModalError(result.error);
          return;
        }
        setSelectedId(result.id);
      } else if (modal === "edit" && selected) {
        const result = await updatePageStyle(selected.id, input);
        if ("error" in result) {
          setModalError(result.error);
          return;
        }
      }
      setModal(null);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(false);
    setSelectedId(null);
    startTransition(async () => {
      await deletePageStyle(selected.id);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">Preview</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-400">
            {selected ? selected.name : "Select a style to preview it."}
          </p>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => openModal("add")}
            disabled={isPending}
            className={buttonClass}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => openModal("edit")}
            disabled={!selected || isPending}
            className={buttonClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={!selected || isPending}
            className={`${buttonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
          >
            Delete
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
          <h2 className="mb-3 text-base text-neutral-800">Page Styles</h2>
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {styles.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-400">
                No styles yet. Use Add to create one.
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
                  {pageStyleTypeLabel(s.type)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {modal && (
        <PageStyleModal
          heading={modal === "add" ? "Add page style" : "Edit page style"}
          initial={
            modal === "edit" && selected
              ? { name: selected.name, type: selected.type }
              : { name: "", type: "" }
          }
          saving={isPending}
          error={modalError}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete && !!selected}
        title="Delete this style?"
        message={`"${selected?.name ?? ""}" will be deleted. This can't be undone.`}
        confirmLabel="Delete style"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
