"use client";

import { useRef, useTransition } from "react";
import { addSettingOption, removeSettingOption, type SettingsField } from "@/lib/actions/artworkSettings";

export default function SettingsListCard({
  siteId,
  field,
  title,
  description,
  options,
  placeholder,
}: {
  siteId: string;
  field: SettingsField;
  title: string;
  description: string;
  options: string[];
  placeholder: string;
}) {
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
                startTransition(() => removeSettingOption(siteId, field, opt))
              }
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {options.length === 0 && (
          <p className="text-xs text-neutral-400">Nothing added yet.</p>
        )}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addSettingOption(siteId, field, formData);
            formRef.current?.reset();
          });
        }}
        className="flex items-start gap-2"
      >
        <textarea
          name="value"
          required
          rows={1}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="flex-1 resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
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
