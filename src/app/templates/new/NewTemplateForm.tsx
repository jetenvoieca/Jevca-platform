"use client";

import { useActionState } from "react";
import { createTemplate, type CreateTemplateState } from "@/lib/actions/templates";

const initialState: CreateTemplateState = {};

export default function NewTemplateForm() {
  const [state, formAction, isPending] = useActionState(createTemplate, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs text-neutral-500">Template name</label>
        <input
          type="text"
          name="name"
          required
          autoFocus
          placeholder="e.g. ISYT"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Template"}
      </button>
    </form>
  );
}
