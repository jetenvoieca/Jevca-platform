"use client";

import { useEffect, useState } from "react";
import type { ConciergeNote } from "@/lib/actions/concierge";
import { listProfileCatalogue, updateProfileStory } from "@/lib/actions/profileStories";

// Concierge — Update my Artist statement (2026-11-13, Craig): the
// statement the artist sent (edited from theirs), checked and corrected
// here, then saved as their Artist Statement (Profile Catalogue) — on the
// website once it's published. The statement as it was is shown beneath.
export default function ConciergeStatementTask({ note }: { note: ConciergeNote }) {
  const [current, setCurrent] = useState<{ id: string; story: string } | null>(null);
  const [text, setText] = useState(note.text);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProfileCatalogue(note.artistId)
      .then((entries) => {
        const statement = entries.find((e) => e.kind === "STATEMENT");
        if (statement) setCurrent({ id: statement.id, story: statement.story });
        else setError("The Artist Statement couldn't be found.");
      })
      .catch(() => setError("The Artist Statement couldn't be loaded."));
  }, [note.artistId]);

  const save = async () => {
    if (!current) return;
    setState("saving");
    setError(null);
    const result = await updateProfileStory(current.id, note.artistId, { story: text }).catch(() => ({
      error: "The statement wasn't saved — please try again.",
    }));
    if ("error" in result) {
      setState("idle");
      return setError(result.error);
    }
    setCurrent({ id: result.id, story: result.story });
    setState("saved");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">New statement</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        className="min-h-48 resize-y rounded-md border border-neutral-300 p-3 text-sm text-neutral-800"
      />
      <div className="flex items-center justify-end gap-3">
        {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
        {state === "saved" && <p className="mr-auto text-sm text-green-700">Saved as the Artist Statement.</p>}
        <button
          type="button"
          onClick={save}
          disabled={!current || state !== "idle" || !text.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : "Update statement"}
        </button>
      </div>
      {current && (
        <>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            {state === "saved" ? "Artist Statement now" : "Artist Statement as it is"}
          </p>
          <p className="whitespace-pre-wrap text-sm text-neutral-500">{current.story || "(empty)"}</p>
        </>
      )}
    </div>
  );
}
