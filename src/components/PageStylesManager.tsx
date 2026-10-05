"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPageStyle,
  deletePageStyle,
  duplicatePageStyle,
  updatePageStyle,
  type PageStyleSummary,
} from "@/lib/actions/pageStyles";
import { pageStyleTypeLabel } from "@/lib/pageStyleTypes";
import PageStyleEditor, {
  draftFrom,
  draftLayout,
  type PageStyleDraft,
} from "@/components/PageStyleEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageStylePreview from "@/components/PageStylePreview";

type Status = { text: string; isError: boolean };

const IDLE: Status = { text: "", isError: false };

// Templates → Page Styles (2026-10-04, from Craig's mockups): the Preview
// panel on the left; on the right, Add / Edit / Duplicate / Delete above
// the list of styles. Clicking a style selects it — Edit, Duplicate
// (2026-10-05) and Delete act on it.
//
// Add and Edit swap the list for the editor panel (PageStyleEditor),
// which stays open until Close. Every change shows in the Preview at
// once and saves itself shortly after (a new style is created the first
// time it has both a name and a type). Saves run one at a time, in
// order, so a quick run of changes can never create a style twice.
// Duplicate makes a copy and selects it, ready to Edit.
export default function PageStylesManager({ styles }: { styles: PageStyleSummary[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PageStyleDraft | null>(null);
  const [status, setStatus] = useState<Status>(IDLE);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  // The style being edited — null while a new one hasn't been saved yet.
  const editingIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PageStyleDraft | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const selected = styles.find((s) => s.id === selectedId) ?? null;

  const save = (d: PageStyleDraft) => {
    queueRef.current = queueRef.current.then(async () => {
      setStatus({ text: "Saving…", isError: false });
      const input = { name: d.name, type: d.type, layout: draftLayout(d)?.layout ?? {} };
      try {
        const id = editingIdRef.current;
        const result = id ? await updatePageStyle(id, input) : await createPageStyle(input);
        if ("error" in result) {
          setStatus({ text: result.error, isError: true });
          return;
        }
        if ("id" in result) {
          editingIdRef.current = result.id;
          setSelectedId(result.id);
        }
        setStatus({ text: "Saved", isError: false });
        router.refresh();
      } catch {
        setStatus({ text: "Couldn't save — try again.", isError: true });
      }
    });
    return queueRef.current;
  };

  const handleChange = (next: PageStyleDraft) => {
    setDraft(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!next.name.trim() || !next.type) {
      pendingRef.current = null;
      setStatus({ text: "Needs a name and a Style Type to save.", isError: false });
      return;
    }
    pendingRef.current = next;
    timerRef.current = setTimeout(() => {
      pendingRef.current = null;
      save(next);
    }, 600);
  };

  const openEditor = (mode: "add" | "edit") => {
    editingIdRef.current = mode === "edit" && selected ? selected.id : null;
    setStatus(IDLE);
    setListError(null);
    setDraft(mode === "edit" && selected ? draftFrom(selected.name, selected) : draftFrom("", null));
  };

  // Saves anything still waiting before closing, so nothing is lost.
  const closeEditor = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    startTransition(async () => {
      await (pending ? save(pending) : queueRef.current);
      setDraft(null);
      setStatus(IDLE);
    });
  };

  const handleDuplicate = () => {
    if (!selected) return;
    setListError(null);
    startTransition(async () => {
      const result = await duplicatePageStyle(selected.id);
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
      await deletePageStyle(selected.id);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  // While editing, the Preview shows the draft as it changes.
  const previewName = draft ? draft.name.trim() || "Untitled style" : selected?.name;
  const previewStyle = draft ? draftLayout(draft) : selected;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">Preview</h2>
        {previewName !== undefined ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{previewName}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {previewStyle ? (
                <PageStylePreview style={previewStyle} />
              ) : (
                <p className="py-10 text-center text-sm text-neutral-400">
                  Choose a Style Type to see its layout.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a style to preview it.</p>
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
          <PageStyleEditor
            draft={draft}
            onChange={handleChange}
            status={isPending ? { text: "Saving…", isError: false } : status}
            onClose={closeEditor}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
            <h2 className="mb-3 text-base text-neutral-800">Page Styles</h2>
            {listError && <p className="mb-2 text-xs text-red-600">{listError}</p>}
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
        )}
      </aside>

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
