"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPresentationTemplate,
  deletePresentationTemplate,
  duplicatePresentationTemplate,
  updatePresentationTemplate,
  type PresentationTemplateSummary,
} from "@/lib/actions/presentationTemplates";
import { DEFAULT_PRESENTATION } from "@/lib/presentationTemplate";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import PresentationTemplateEditor, { type PresentationTemplateDraft } from "@/components/PresentationTemplateEditor";
import WorkPresentation from "@/components/WorkPresentation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAutoSave } from "@/components/useAutoSave";

// Templates → Presentations (2026-10-19, Craig's request): the shared
// library of looks for a work's details when it's opened on a page, laid
// out like Menus — the Preview on the left (a sample work); on the right,
// Add / Edit / Duplicate / Delete above the list. Add and Edit swap the
// list for the editor (PresentationTemplateEditor) until Close; every
// change shows in the Preview at once and saves itself shortly after.
// Duplicate makes a variation to experiment with.

// The sample work the Preview shows.
const SAMPLE: CurationWorkPresentation = {
  artworkId: "sample",
  catalogueName: "Rude",
  description: null,
  defaultDescription: null,
  artworkDescription:
    "RUDE was originally created when I first relocated to Brighton, as part of the ‘Day Tripper’ series. Inspired by the fairground elements of Brighton Pier this fun work suggests a cheeky joke shared, a giggle and snigger over a naughty thought or comment.\nRecently, wanting to work again with this much loved piece, I had her printed in a large format and have thoroughly enjoyed playing with all the gorgeousness, gold, glitter, gloss and an abundance of stickers, sequins and sparkles to create a completely new unique work of art.",
  offeredPrice: "1995",
  priceCurrency: "GBP",
  defaultInstalmentCount: 5,
  images: [],
  medium: "Unique work on paper. Mixed media including gloss paint, gold leaf, glitter, and sparkling crystals.",
  edition: "Edition",
  type: "Paper",
  size: "18 x 18 cms (27 x 27 cms framed)",
  viewingLocation: "La Galerie",
  available: true,
  releaseMessage: "Delivery after 2nd payment",
  enquiryEmail: "louise@jevca.art",
  artistFirstName: "Louise",
  instagramHandle: "louisedear",
};

export default function PresentationTemplatesManager({ templates }: { templates: PresentationTemplateSummary[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<PresentationTemplateDraft | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const autoSave = useAutoSave<PresentationTemplateDraft>({
    create: createPresentationTemplate,
    update: updatePresentationTemplate,
    cannotSave: (d) => (!d.name.trim() ? "Needs a name to save." : null),
    onSaved: (id) => {
      setSelectedId(id);
      router.refresh();
    },
  });

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const handleChange = (next: PresentationTemplateDraft) => {
    setDraft(next);
    autoSave.schedule(next);
  };

  const openEditor = (mode: "add" | "edit") => {
    autoSave.begin(mode === "edit" && selected ? selected.id : null);
    setListError(null);
    setDraft(
      mode === "edit" && selected
        ? { name: selected.name, settings: selected.settings }
        : { name: "", settings: DEFAULT_PRESENTATION },
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
      const result = await duplicatePresentationTemplate(selected.id);
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
      await deletePresentationTemplate(selected.id);
      router.refresh();
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  // While editing, the Preview shows the draft as it changes.
  const preview = draft ? { name: draft.name.trim() || "Untitled template", settings: draft.settings } : selected;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">Preview</h2>
        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{preview.name}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-500/40 p-6">
              <div className="mx-auto" style={{ maxWidth: preview.settings.maxWidth }}>
                <WorkPresentation
                  data={SAMPLE}
                  settings={preview.settings}
                  viewIndex={0}
                  onView={() => {}}
                  onClose={() => {}}
                />
              </div>
            </div>
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
          <PresentationTemplateEditor
            draft={draft}
            onChange={handleChange}
            status={isPending ? { text: "Saving…", isError: false } : autoSave.status}
            onClose={closeEditor}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
            <h2 className="mb-3 text-base text-neutral-800">Presentations</h2>
            {listError && <p className="mb-2 text-xs text-red-600">{listError}</p>}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {templates.length === 0 && (
                <p className="py-4 text-center text-xs text-neutral-400">No templates yet. Use Add to create one.</p>
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
        message={`"${selected?.name ?? ""}" will be deleted. Page Styles using it go back to the built-in look. This can't be undone.`}
        confirmLabel="Delete template"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
