"use client";

import { useActionState } from "react";
import { createSite, type CreateSiteState } from "@/lib/actions";
import { CLIENT_KINDS, clientWords, type ClientKind } from "@/lib/clientKind";

const initialState: CreateSiteState = {};

export default function NewSiteForm({
  artists,
}: {
  artists: { id: string; name: string; kind: ClientKind }[];
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
          Artist or Brand
        </label>
        {artists.length > 0 && (
          <select
            name="artistId"
            className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">— Choose an existing artist or brand —</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({clientWords(a.kind).client})
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="newArtistName"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Or type a new name to create one"
        />
        {/* Only used when a new name is typed. Fixed once created. */}
        <div className="mt-2 flex gap-4 text-sm text-neutral-700">
          {CLIENT_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-1.5">
              <input type="radio" name="newClientKind" value={kind} />
              {clientWords(kind).client}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Choose an existing one above, or type a new name and pick Artist or Brand — not
          both. A new client&apos;s type can&apos;t be changed later.
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
