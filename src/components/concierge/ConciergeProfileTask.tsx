"use client";

import { useEffect, useState } from "react";
import { conciergeGalleryOptions, type ConciergeNote } from "@/lib/actions/concierge";
import {
  listProfileCatalogue,
  setProfileGalleries,
  updateProfileStory,
  type ProfileStoryRow,
} from "@/lib/actions/profileStories";
import { CONCIERGE_PROFILE_KINDS, isConciergeProfileKind } from "@/lib/concierge";
import { GalleriesList, type GalleryOption } from "@/components/ProfileStoryModal";

// Concierge — Update my Artist statement / Biography / list of Galleries
// (2026-11-13, Craig): what the artist sent (edited from the entry as it
// was) is checked here and their Profile Catalogue entry updated — on the
// website once it's published. Statement and Biography: the text sent,
// corrected here, then Update; the entry as it is shown beneath.
// Galleries: the names sent are in the request above; the entry's
// galleries are chosen and ordered here (each change saved at once).
export default function ConciergeProfileTask({ note }: { note: ConciergeNote }) {
  const entryKind = note.kindKey && isConciergeProfileKind(note.kindKey) ? CONCIERGE_PROFILE_KINDS[note.kindKey].entry : null;
  const [entry, setEntry] = useState<ProfileStoryRow | null>(null);
  const [options, setOptions] = useState<GalleryOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entryKind) return;
    Promise.all([
      listProfileCatalogue(note.artistId),
      entryKind === "GALLERIES" ? conciergeGalleryOptions(note.artistId) : Promise.resolve([]),
    ])
      .then(([entries, galleries]) => {
        const found = entries.find((e) => e.kind === entryKind);
        if (found) setEntry(found);
        else setError("The Profile entry couldn't be found.");
        setOptions(galleries);
      })
      .catch(() => setError("The Profile entry couldn't be loaded."));
  }, [note.artistId, entryKind]);

  if (error) return <p className="text-center text-sm text-red-600">{error}</p>;
  if (!entry) return <p className="text-center text-sm text-neutral-400">Loading…</p>;

  if (entry.kind === "GALLERIES") {
    return (
      <div className="rounded-lg border border-neutral-200 p-4">
        <GalleriesList
          siteId={note.siteId}
          chosen={entry.galleries.map((g) => ({ id: g.locationId, name: g.name }))}
          options={options}
          onChange={async (ids) => {
            setError(null);
            const result = await setProfileGalleries(entry.id, note.artistId, ids).catch(() => ({
              error: "The galleries weren't saved — please try again.",
            }));
            if ("error" in result) setError(result.error);
            else setEntry(result);
          }}
        />
      </div>
    );
  }
  return <TextEntry note={note} entry={entry} onSaved={setEntry} />;
}

function TextEntry({
  note,
  entry,
  onSaved,
}: {
  note: ConciergeNote;
  entry: ProfileStoryRow;
  onSaved: (row: ProfileStoryRow) => void;
}) {
  const [text, setText] = useState(note.text);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const name = entry.caption;

  const save = async () => {
    setState("saving");
    setError(null);
    const result = await updateProfileStory(entry.id, note.artistId, { story: text }).catch(() => ({
      error: "That wasn't saved — please try again.",
    }));
    if ("error" in result) {
      setState("idle");
      return setError(result.error);
    }
    onSaved(result);
    setState("saved");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">New {name}</p>
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
        {state === "saved" && <p className="mr-auto text-sm text-green-700">Saved as the {name}.</p>}
        <button
          type="button"
          onClick={save}
          disabled={state !== "idle" || !text.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : `Update ${name}`}
        </button>
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {name} {state === "saved" ? "now" : "as it is"}
      </p>
      <p className="whitespace-pre-wrap text-sm text-neutral-500">{entry.story || "(empty)"}</p>
    </div>
  );
}
