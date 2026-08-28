"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlatformExpenseCategory,
  removePlatformExpenseCategory,
} from "@/lib/actions/platformExpenseSettings";

// Standalone version of the category editor, on its own Settings page
// (2026-08-28) — was a collapsible "Manage categories" section inline on
// the Expenses page; moved out and renamed for clarity now the nav has
// room for it as its own item, same reasoning as the artist-level
// Purchases Settings page.
export default function PlatformExpenseCategoriesCard({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">
        Expense Categories
      </h3>
      <p className="mb-3 text-xs text-neutral-500">
        Shown as the dropdown on the Expenses page. Removing a category here doesn&apos;t change
        any past expense already recorded under it — only what&apos;s offered for new entries.
      </p>

      <div className="mb-3 flex flex-col gap-2">
        {categories.map((cat) => (
          <div
            key={cat}
            className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <span>{cat}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await removePlatformExpenseCategory(cat);
                  router.refresh();
                })
              }
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-xs text-neutral-400">
            Nothing added yet — new expenses will default to &quot;Other&quot; until you add some.
          </p>
        )}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addPlatformExpenseCategory(formData);
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
          placeholder="e.g. Hosting"
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
