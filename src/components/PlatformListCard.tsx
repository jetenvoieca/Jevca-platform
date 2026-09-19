"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// One editable list on the platform-level Settings page (2026-09-19) —
// generalised from the old PlatformExpenseCategoriesCard, which was
// hard-wired to the expense category actions, so the new Task category
// list could reuse it rather than being a near-identical copy. The page
// passes in the add/remove server actions for whichever list this card
// is editing.
export default function PlatformListCard({
  title,
  description,
  placeholder,
  emptyText,
  options,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  emptyText: string;
  options: string[];
  onAdd: (formData: FormData) => Promise<void>;
  onRemove: (value: string) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">{title}</h3>
      <p className="mb-3 text-xs text-neutral-500">{description}</p>

      <div className="mb-3 flex flex-col gap-2">
        {options.map((opt) => (
          <div
            key={opt}
            className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <span>{opt}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await onRemove(opt);
                  router.refresh();
                })
              }
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {options.length === 0 && <p className="text-xs text-neutral-400">{emptyText}</p>}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await onAdd(formData);
            formRef.current?.reset();
            router.refresh();
          });
        }}
        className="flex items-start gap-2"
      >
        <input
          type="text"
          name="value"
          required
          placeholder={placeholder}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
