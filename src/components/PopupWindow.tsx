"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// A small window opened on top of another modal (2026-09-28) — the task's
// Email and Activity windows (see TaskActivityPanel) and the Inbox's
// Forward window (see ForwardEmailPopup). Rendered into document.body so
// it sits above the modal it was opened from; React still treats it as
// part of that modal, so a click in it never reaches (and closes) the one
// behind. Close and tapping outside both call onClose, which decides
// whether anything typed needs a confirm first.
export default function PopupWindow({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
