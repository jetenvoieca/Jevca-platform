"use client";

import { useRef, useTransition } from "react";
import { addMediaTagPreset, removeMediaTagPreset } from "@/lib/actions/mediaCatalogue";

export default function MediaTagSettingsCard({
  artistId,
  siteId,
  tags,
}: {
  artistId: string;
  siteId: string;
  tags: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="max-w-md rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">Tags</h3>
      <p className="mb-3 text-xs text-neutral-500">
        Offered when tagging Marketing media, so wording stays consistent for searching later.
      </p>

      <div className="mb-3 flex flex-col gap-2">
        {tags.map((t) => (
          <div
            key={t}
            className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <span>{t}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => removeMediaTagPreset(artistId, siteId, t))}
              className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-xs text-neutral-400">Nothing added yet.</p>}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addMediaTagPreset(artistId, siteId, formData);
            formRef.current?.reset();
          });
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          name="value"
          required
          placeholder="New tag…"
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
