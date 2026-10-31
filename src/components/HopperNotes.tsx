"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeHopperNote, type HopperNoteItem } from "@/lib/actions/hopper";
import { formatDateTime } from "@/lib/formatDate";

// The notes in a client's Hopper (2026-10-31): text sent from the Studio
// app's Instructions screen, oldest first, above the pictures waiting to
// be sorted. Each is read here and marked Done, which removes it.
export default function HopperNotes({ notes }: { notes: HopperNoteItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (notes.length === 0) return null;

  const done = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      await completeHopperNote(id);
      router.refresh();
    });
  };

  return (
    <div className="mb-3 flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Instructions</p>
      {notes.map((n) => (
        <div
          key={n.id}
          className={`rounded-md border border-neutral-200 bg-white p-3 ${busyId === n.id ? "opacity-50" : ""}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] text-neutral-400">{formatDateTime(n.createdAt)}</span>
            <button
              type="button"
              onClick={() => done(n.id)}
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-2 py-[2px] text-xs hover:bg-neutral-50 disabled:opacity-50"
            >
              Done
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-neutral-800">{n.text}</p>
        </div>
      ))}
    </div>
  );
}
