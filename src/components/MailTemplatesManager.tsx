"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMailTemplate,
  deleteMailTemplate,
  duplicateMailTemplate,
  updateMailTemplate,
  type MailTemplateSummary,
} from "@/lib/actions/mailTemplates";
import { newMailTemplateLayout } from "@/lib/mailTemplateLayout";
import MailTemplateEditor, { type MailTemplateDraft } from "@/components/MailTemplateEditor";
import MailTemplatePreview from "@/components/MailTemplatePreview";
import MailLayoutEditor from "@/components/MailLayoutEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAutoSave } from "@/components/useAutoSave";

// Templates → Mail Templates (2026-10-08, Marketing step 2): laid out
// like Page Styles — the Preview panel on the left; on the right, Add /
// Edit / Duplicate / Delete above the list of templates. Clicking a
// template selects it — Edit, Duplicate and Delete act on it.
//
// Add and Edit swap the list for the editor panel (MailTemplateEditor),
// which stays open until Close, and the Preview panel becomes the
// visual editor (MailLayoutEditor), where components are added, moved,
// sized, spaced and aligned by hand. Every change shows at once and
// saves itself shortly after (a new template is created the first time
// it has a name — see useAutoSave).
export default function MailTemplatesManager({
  templates,
}: {
  templates: MailTemplateSummary[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MailTemplateDraft | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const autoSave = useAutoSave<MailTemplateDraft>({
    create: createMailTemplate,
    update: updateMailTemplate,
    cannotSave: (d) => (!d.name.trim() ? "Needs a name to save." : null),
    onSaved: (id) => {
      setSelectedId(id);
      router.refresh();
    },
  });

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const handleChange = (next: MailTemplateDraft) => {
    setDraft(next);
    autoSave.schedule(next);
  };

  const openEditor = (mode: "add" | "edit") => {
    autoSave.begin(mode === "edit" && selected ? selected.id : null);
    setListError(null);
    setDraft(
      mode === "edit" && selected
        ? { name: selected.name, layout: selected.layout }
        : { name: "", layout: newMailTemplateLayout() }
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
      const result = await duplicateMailTemplate(selected.id);
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
      await deleteMailTemplate(selected.id);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  const previewName = draft ? draft.name.trim() || "Untitled template" : selected?.name;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">{draft ? "Layout" : "Preview"}</h2>
        {previewName !== undefined ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{previewName}</h3>
            {draft ? (
              <MailLayoutEditor
                layout={draft.layout}
                onChange={(layout) => handleChange({ ...draft, layout })}
              />
            ) : (
              selected && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <MailTemplatePreview layout={selected.layout} />
                </div>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a template to preview it.</p>
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
          <MailTemplateEditor
            draft={draft}
            onChange={handleChange}
            status={isPending ? { text: "Saving…", isError: false } : autoSave.status}
            onClose={closeEditor}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
            <h2 className="mb-3 text-base text-neutral-800">Mail Templates</h2>
            {listError && <p className="mb-2 text-xs text-red-600">{listError}</p>}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {templates.length === 0 && (
                <p className="py-4 text-center text-xs text-neutral-400">
                  No templates yet. Use Add to create one.
                </p>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                  className={`w-full truncate rounded-md border px-3 py-2 text-left text-sm ${
                    t.id === selectedId
                      ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                      : "border-transparent text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={confirmingDelete && !!selected}
        title="Delete this template?"
        message={`"${selected?.name ?? ""}" will be deleted. Mails already made from it keep their layout. This can't be undone.`}
        confirmLabel="Delete template"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
