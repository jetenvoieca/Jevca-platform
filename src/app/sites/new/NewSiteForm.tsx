"use client";

import { useActionState } from "react";
import { createSite, type CreateSiteState } from "@/lib/actions";

const initialState: CreateSiteState = {};

export default function NewSiteForm({
  artists,
}: {
  artists: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(
    createSite,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Site name
        </label>
        <input
          type="text"
          name="siteName"
          required
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="e.g. Jane Doe — Main Site"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Artist
        </label>
        {artists.length > 0 && (
          <select
            name="artistId"
            className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">— Choose an existing artist —</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="newArtistName"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Or type a new artist's name to create one"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Choose an existing artist above, or type a new name here — not both.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Site"}
      </button>
    </form>
  );
}
