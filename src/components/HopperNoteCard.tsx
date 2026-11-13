"use client";

import type { HopperNoteItem } from "@/lib/actions/hopper";
import { formatDateTime } from "@/lib/formatDate";

// The navy of a note's tile and panel — the site header's icons' colour.
export const NOTE_BG = "bg-[#2c3e6b]";

// A note's tile in the list (2026-10-31, Craig's mockup).
export function HopperNoteTile({
  note,
  selected = false,
  disabled = false,
  onClick,
}: {
  note: HopperNoteItem;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={note.text}
      className={`flex aspect-square items-center justify-center rounded-md border-2 ${
        selected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
      } ${NOTE_BG} px-1 text-[11px] font-semibold tracking-wide text-white disabled:opacity-40`}
    >
      INSTRUCTION
    </button>
  );
}

// A note opened for sorting (2026-10-31, Craig's mockup): when it came,
// its text on the Hopper's navy, then Done (kept on record) or Delete.
// Administration → Concierge (2026-11-13) adds who sent it (`from`) and,
// under Done / Delete (kept straight under the text, Craig), the form to
// act on it (`children`).
export default function HopperNoteCard({
  note,
  from,
  isPending,
  onDone,
  onDelete,
  children,
}: {
  note: HopperNoteItem;
  from?: string;
  isPending: boolean;
  onDone: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const buttonCls =
    "w-44 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <p className="mb-3 text-xs text-neutral-400">
        {from && <span className="mr-2 font-medium text-neutral-700">{from}</span>}
        Received {formatDateTime(note.createdAt)}
      </p>
      <div className={`mb-4 min-h-[360px] rounded-md ${NOTE_BG} px-4 py-8 text-white`}>
        {/* A Concierge request (2026-11-13) says so, with its kind; its
            picture is shown here and is in the Hopper to sort too. */}
        <p className="mb-12 text-center text-xs font-semibold tracking-wide">
          {note.kind ? `CONCIERGE — ${note.kind.toUpperCase()}` : "INSTRUCTION"}
        </p>
        <p className="whitespace-pre-wrap text-lg font-semibold">{note.text}</p>
        {note.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={note.imageUrl} alt="" className="mt-6 max-h-60 rounded-md object-contain" />
        )}
      </div>
      <div className="flex justify-between gap-3">
        <button type="button" onClick={onDone} disabled={isPending} className={buttonCls}>
          Done
        </button>
        <button type="button" onClick={onDelete} disabled={isPending} className={buttonCls}>
          Delete
        </button>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
