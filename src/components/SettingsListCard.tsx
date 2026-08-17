"use client";

import { useRef, useTransition } from "react";
import { addSettingOption, removeSettingOption, type SettingsField } from "@/lib/actions/artworkSettings";

// Pulls out the first number in a preset string — e.g. "27 x 27 cms
// Framed" → 27, "100 x 100 cms" → 100 — so Size Presets can be shown
// ordered by actual dimension rather than whatever order they happened
// to be typed in (2026-08-17: the list grows long enough over time that
// scanning it in insertion order stopped being practical). Anything with
// no leading number at all sorts to the end rather than erroring or
// jumping to the front.
function firstNumber(s: string): number {
  const match = s.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : Infinity;
}

export default function SettingsListCard({
  artistId,
  siteId,
  field,
  title,
  description,
  options,
  placeholder,
  sortNumerically = false,
}: {
  artistId: string;
  siteId: string;
  field: SettingsField;
  title: string;
  description: string;
  options: string[];
  placeholder: string;
  // Display-only — doesn't change storage order or affect any other
  // preset list. Deliberately opt-in per card rather than a global
  // default, since Groups/Types/etc. are arbitrary labels a numeric sort
  // would scramble meaninglessly; Size is the one list where the values
  // themselves are inherently ordered.
  sortNumerically?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const displayOptions = sortNumerically
    ? [...options].sort((a, b) => firstNumber(a) - firstNumber(b))
    : options;

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">{title}</h3>
      <p className="mb-3 text-xs text-neutral-500">{description}</p>

      <div className="mb-3 flex flex-col gap-2">
        {displayOptions.map((opt) => (
          <div
            key={opt}
            className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <span>{opt}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(() => removeSettingOption(artistId, siteId, field, opt))
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
            await addSettingOption(artistId, siteId, field, formData);
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
