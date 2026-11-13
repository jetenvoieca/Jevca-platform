"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeHopperNote, deleteHopperNote } from "@/lib/actions/hopper";
import type { ConciergeNote, ConciergePicture } from "@/lib/actions/concierge";
import type { ConciergeKind } from "@/lib/concierge";
import HopperNoteCard, { HopperNoteTile, NOTE_BG } from "@/components/HopperNoteCard";
import ConciergePagesTask from "@/components/concierge/ConciergePagesTask";

// Administration → Concierge (2026-11-13, Craig's mockup): a Hopper for
// every site at once. On the left, the notes still to do — Concierge
// requests and Studio app instructions — and the pictures sent with
// Concierge requests (tapped, they open in their site's Hopper to sort).
// A note opens in the middle with who sent it and, for a kind of request
// that has one, the form to do it on their site; then Done (the artist
// sees it done) or Delete. On the right, what's just been done.

// The form for each kind of request that has one; more as they're built.
const TASKS: Partial<Record<ConciergeKind, React.ComponentType<{ siteId: string }>>> = {
  pages: ConciergePagesTask,
};

type Tile =
  | { type: "note"; id: string; createdAt: string; note: ConciergeNote }
  | { type: "picture"; id: string; createdAt: string; picture: ConciergePicture };

// What's just been done — a confirmation trail kept in this browser.
type ProcessedEntry = { key: string; label: string; from: string };
const PROCESSED_KEY = "jevca:concierge-processed";

// Who sent it: the client, and the site when it's named differently.
function fromOf(note: ConciergeNote): string {
  return note.siteName && note.siteName !== note.client ? `${note.client} · ${note.siteName}` : note.client;
}

export default function ConciergeView({
  notes,
  pictures,
}: {
  notes: ConciergeNote[];
  pictures: ConciergePicture[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processed, setProcessed] = useState<ProcessedEntry[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROCESSED_KEY);
      if (stored) setProcessed(JSON.parse(stored));
    } catch {
      // Unreadable — start with an empty trail.
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(PROCESSED_KEY, JSON.stringify(processed));
    } catch {
      // Storage unavailable — the trail just isn't kept this time.
    }
  }, [processed]);

  const tiles: Tile[] = [
    ...notes.map((note): Tile => ({ type: "note", id: note.id, createdAt: note.createdAt, note })),
    ...pictures.map(
      (picture): Tile => ({ type: "picture", id: picture.imageId, createdAt: picture.createdAt, picture }),
    ),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const current = notes.find((n) => n.id === selectedId) ?? null;

  const handle = (note: ConciergeNote, action: "done" | "delete") => {
    // Then the next note down the list, if there is one.
    const index = notes.findIndex((n) => n.id === note.id);
    const next = notes[index + 1] ?? notes[index - 1] ?? null;
    startTransition(async () => {
      try {
        await (action === "done" ? completeHopperNote(note.id) : deleteHopperNote(note.id));
      } catch {
        setError("That wasn't saved — please try again.");
        return;
      }
      setError(null);
      setProcessed((prev) => [
        {
          key: `${note.id}-${Date.now()}`,
          label: `${action === "done" ? "Done" : "Deleted"}: ${note.kind ?? "Instruction"}`,
          from: fromOf(note),
        },
        ...prev,
      ]);
      setSelectedId(next?.id ?? null);
      router.refresh();
    });
  };

  const Task = current?.kindKey ? TASKS[current.kindKey as ConciergeKind] : undefined;

  return (
    <div className="mx-auto min-h-full max-w-[1700px] px-6 py-4">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Concierge</h1>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-6 lg:h-[calc(100vh-8rem)] lg:flex-row lg:items-stretch">
        <div className="order-2 lg:order-none lg:min-w-[260px] lg:max-w-[700px] lg:flex-1 lg:basis-[38%] lg:overflow-y-auto lg:pr-1">
          {tiles.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing waiting.</p>
          ) : (
            <div className="grid grid-cols-6 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]">
              {tiles.map((tile) =>
                tile.type === "note" ? (
                  <HopperNoteTile
                    key={tile.id}
                    note={tile.note}
                    selected={tile.id === selectedId}
                    onClick={() => setSelectedId(tile.id)}
                  />
                ) : (
                  <Link
                    key={tile.id}
                    href={`/sites/${tile.picture.siteId}/hopper?item=${tile.picture.imageId}`}
                    title={`${tile.picture.client} — sort in their Hopper`}
                    className="overflow-hidden rounded-md border-2 border-transparent hover:border-neutral-300"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tile.picture.url} alt="" className="aspect-square w-full object-cover" />
                  </Link>
                ),
              )}
            </div>
          )}
        </div>

        <div className="order-1 lg:order-none lg:min-w-[320px] lg:flex-1 lg:basis-[42%] lg:overflow-y-auto lg:pr-1">
          {!current ? (
            <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
              {notes.length === 0 ? "No requests waiting." : "Pick a request from the list."}
            </div>
          ) : (
            <HopperNoteCard
              key={current.id}
              note={current}
              from={fromOf(current)}
              isPending={isPending}
              onDone={() => handle(current, "done")}
              onDelete={() => handle(current, "delete")}
            >
              {Task &&
                (current.siteId ? (
                  <Task siteId={current.siteId} />
                ) : (
                  <p className="text-center text-sm text-neutral-500">
                    This request doesn&apos;t say which of {current.client}&apos;s sites it&apos;s for.
                  </p>
                ))}
            </HopperNoteCard>
          )}
        </div>

        <div className="order-3 flex flex-col lg:order-none lg:min-w-[220px] lg:max-w-[320px] lg:flex-1 lg:basis-[20%] lg:overflow-hidden">
          {processed.length > 0 && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Processed</p>
                <button
                  type="button"
                  onClick={() => setProcessed([])}
                  className="text-xs text-neutral-400 hover:text-neutral-700 hover:underline"
                >
                  Clear list
                </button>
              </div>
              <div className="space-y-2 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {processed.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center gap-3 rounded-md border border-neutral-200 p-2"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded ${NOTE_BG} text-[9px] font-semibold text-white`}
                    >
                      IN
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-neutral-800">✓ {entry.label}</p>
                      <p className="truncate text-xs text-neutral-400">{entry.from}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProcessed((prev) => prev.filter((p) => p.key !== entry.key))}
                      aria-label="Remove from list"
                      className="shrink-0 px-1 text-neutral-400 hover:text-neutral-700"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
