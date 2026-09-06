"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTemplateName,
  addTemplatePage,
  deleteTemplatePage,
  type AddTemplatePageState,
  type PageStyleValue,
} from "@/lib/actions/templates";

type TemplatePageRow = {
  id: string;
  name: string;
  style: PageStyleValue;
  position: number;
};

const STYLE_LABELS: Record<PageStyleValue, string> = {
  PORTFOLIO: "portfolio",
  SHOWCASE: "showcase",
  PROFILE: "profile",
  EXHIBITIONS: "exhibitions",
  HOME: "home",
  // Points at the existing free-form block/row editor (see PageStyle in
  // schema.prisma) rather than a fixed renderer of its own.
  FREEFORM: "freeform (existing block editor)",
};

const STYLE_OPTIONS: PageStyleValue[] = [
  "PORTFOLIO",
  "SHOWCASE",
  "PROFILE",
  "EXHIBITIONS",
  "HOME",
  "FREEFORM",
];

const initialAddState: AddTemplatePageState = {};

export default function TemplateEditorPanel({
  template,
}: {
  template: { id: string; name: string; pages: TemplatePageRow[] };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const boundAddTemplatePage = addTemplatePage.bind(null, template.id);
  const [addState, addFormAction, addIsPending] = useActionState(
    boundAddTemplatePage,
    initialAddState
  );

  const handleNameBlur = (value: string) => {
    if (!value.trim() || value.trim() === template.name) return;
    startTransition(async () => {
      await updateTemplateName(template.id, value.trim());
      router.refresh();
    });
  };

  const handleDeletePage = (pageId: string) => {
    if (!confirm("Remove this page from the template?")) return;
    startTransition(async () => {
      await deleteTemplatePage(pageId, template.id);
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <label className="mb-1 block text-xs text-neutral-500">Template</label>
        <input
          key={`template-name-${template.id}`}
          type="text"
          defaultValue={template.name}
          onBlur={(e) => handleNameBlur(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
        />
      </div>

      {template.pages.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-neutral-500">Pages</p>
          <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
            {template.pages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {STYLE_LABELS[p.style]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeletePage(p.id)}
                    className="text-neutral-400 hover:text-red-600"
                    aria-label={`Remove ${p.name}`}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        key={`add-page-form-${template.pages.length}`}
        action={addFormAction}
        className="flex flex-col gap-2 border-t border-neutral-200 pt-4"
      >
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Page Name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Home page"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Page Style</label>
          <select
            name="style"
            size={STYLE_OPTIONS.length}
            required
            defaultValue=""
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {STYLE_OPTIONS.map((style) => (
              <option key={style} value={style}>
                {STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </div>

        {addState.error && <p className="text-xs text-red-600">{addState.error}</p>}

        <button
          type="submit"
          disabled={addIsPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {addIsPending ? "Adding…" : "+ Add new menu item"}
        </button>
      </form>
    </div>
  );
}
